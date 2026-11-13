"""Db2 LUW 11.5 metadata -> pandas DataFrames -> KJA ERD SQLite catalog.

Python 3.11+ (3.14 OK), pandas required. Reuse your existing JDBC/DB-API client.
No new DB2 driver is installed by this script. Db2 z/OS / IBM i are not supported.
Install dependency using the same Python environment: python -m pip install pandas

반영 후: SQL -> SQLite 메타데이터 가져오기 -> 조회 -> 테이블 선택 -> ERD 적용.
이 스크립트는 FK/일반 인덱스/계산식/IDENTITY 시작값·증가값을 저장하지 않습니다.
단일 컬럼 UNIQUE 제약만 is_unique로 표시하며 복합 UNIQUE를 개별 UNIQUE로 바꾸지 않습니다.
CODEUNITS32 같은 비기본 길이 단위는 보존하나 ERD 자리수 편집/타 DBMS 출력은 확인하세요.
DB2 카탈로그 2회 조회 중 DDL 변경이 없는 시점에 실행하세요.
실제 DB2 연결은 사용자의 클래스에 연결해야 하며, 이 파일에 비밀번호를 저장하지 마세요.


Use with a DB-API connection (e.g. JayDeBeApi connection):
    sync = Db2ToKjaErd(r'C:\\tools\\kja-erd\\data\\erd.sqlite', connection=conn)
    tables_df, columns_df = sync.fetch_metadata('APP', ['CUSTOMER', 'CUSTOMER_REVIEW'])
    print(tables_df.to_string(index=False))
    print(columns_df.to_string(index=False))
    print(sync.save(tables_df, columns_df))

Or reuse a method returning a DataFrame:
    sync = Db2ToKjaErd(SQLITE_PATH, query_df=lambda sql, params: db.query_df(sql, params))

query_df must accept parameterized SQL with ? placeholders and a tuple of values.
Adapt only get_db2_connection() at the bottom to run this file directly.
The caller owns the DB2 connection; this class never closes/commits it.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Callable

import pandas as pd

LOG = logging.getLogger('db2_to_kja_erd')
TABLE_FIELDS = ['schema_name', 'table_name', 'logical_name']
COLUMN_FIELDS = [
    'schema_name', 'table_name', 'ordinal_position', 'column_name', 'logical_name',
    'data_type', 'is_pk', 'is_nullable', 'is_unique', 'default_value',
    'is_identity', 'identity_mode',
]

TABLE_SQL = """
SELECT t.TABSCHEMA AS SCHEMA_NAME, t.TABNAME AS TABLE_NAME,
       COALESCE(t.REMARKS, '') AS LOGICAL_NAME
FROM SYSCAT.TABLES t
WHERE t.TYPE = 'T' AND t.TABSCHEMA = ? {table_filter}
ORDER BY t.TABSCHEMA, t.TABNAME
"""
COLUMN_SQL = """
SELECT c.TABSCHEMA AS SCHEMA_NAME, c.TABNAME AS TABLE_NAME,
       c.COLNO + 1 AS ORDINAL_POSITION, c.COLNAME AS COLUMN_NAME,
       COALESCE(c.REMARKS, '') AS LOGICAL_NAME,
       c.TYPESCHEMA AS TYPE_SCHEMA, c.TYPENAME AS TYPE_NAME,
       c.LENGTH AS TYPE_LENGTH, c.SCALE AS TYPE_SCALE,
       c.TYPESTRINGUNITS AS STRING_UNITS, c.STRINGUNITSLENGTH AS STRING_LENGTH,
       c.CODEPAGE AS CODE_PAGE,
       CASE WHEN COALESCE(c.KEYSEQ, 0) > 0 THEN 1 ELSE 0 END AS IS_PK,
       CASE WHEN c.NULLS = 'Y' THEN 1 ELSE 0 END AS IS_NULLABLE,
       CASE WHEN EXISTS (
           SELECT 1 FROM SYSCAT.TABCONST tc
           JOIN SYSCAT.KEYCOLUSE k ON k.TABSCHEMA = tc.TABSCHEMA
             AND k.TABNAME = tc.TABNAME AND k.CONSTNAME = tc.CONSTNAME
           WHERE tc.TABSCHEMA = c.TABSCHEMA AND tc.TABNAME = c.TABNAME
             AND tc.TYPE = 'U' AND k.COLNAME = c.COLNAME
             AND (SELECT COUNT(*) FROM SYSCAT.KEYCOLUSE k2
                  WHERE k2.TABSCHEMA = tc.TABSCHEMA AND k2.TABNAME = tc.TABNAME
                    AND k2.CONSTNAME = tc.CONSTNAME) = 1
       ) THEN 1 ELSE 0 END AS IS_UNIQUE,
       CAST(c.\"DEFAULT\" AS VARCHAR(32672)) AS DEFAULT_VALUE,
       CASE WHEN c.IDENTITY = 'Y' THEN 1 ELSE 0 END AS IS_IDENTITY,
       c.GENERATED AS GENERATED_KIND
FROM SYSCAT.COLUMNS c
JOIN SYSCAT.TABLES t ON t.TABSCHEMA = c.TABSCHEMA AND t.TABNAME = c.TABNAME
WHERE t.TYPE = 'T' AND t.TABSCHEMA = ? {table_filter}
  AND COALESCE(c.HIDDEN, ' ') <> 'S'
ORDER BY c.TABSCHEMA, c.TABNAME, c.COLNO
"""

# Exact catalog schema used by KJA ERD; no projects/shared dictionary changes.
SQLITE_SCHEMA = r'''-- KJA ERD metadata catalog in data/erd.sqlite (SQLite).
-- Run once manually, or start the app: it creates these empty tables automatically.

CREATE TABLE IF NOT EXISTS metadata_tables (
  schema_name TEXT NOT NULL DEFAULT '' COLLATE NOCASE CHECK (schema_name = trim(schema_name)),
  table_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(table_name)) > 0 AND table_name = trim(table_name)),
  logical_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (schema_name, table_name)
);
CREATE TABLE IF NOT EXISTS metadata_columns (
  schema_name TEXT NOT NULL DEFAULT '' COLLATE NOCASE CHECK (schema_name = trim(schema_name)),
  table_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(table_name)) > 0 AND table_name = trim(table_name)),
  ordinal_position INTEGER NOT NULL CHECK (typeof(ordinal_position) = 'integer' AND ordinal_position > 0),
  column_name TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(column_name)) > 0 AND column_name = trim(column_name)),
  logical_name TEXT NOT NULL DEFAULT '',
  data_type TEXT NOT NULL CHECK (length(trim(data_type)) > 0),
  is_pk INTEGER NOT NULL DEFAULT 0 CHECK (is_pk IN (0, 1)),
  is_nullable INTEGER NOT NULL DEFAULT 1 CHECK (is_nullable IN (0, 1)),
  is_unique INTEGER NOT NULL DEFAULT 0 CHECK (is_unique IN (0, 1)),
  default_value TEXT NOT NULL DEFAULT '',
  is_identity INTEGER NOT NULL DEFAULT 0 CHECK (is_identity IN (0, 1)),
  identity_mode TEXT NOT NULL DEFAULT 'BY DEFAULT' CHECK (identity_mode IN ('ALWAYS', 'BY DEFAULT')),
  PRIMARY KEY (schema_name, table_name, column_name),
  UNIQUE (schema_name, table_name, ordinal_position),
  CHECK (is_pk = 0 OR is_nullable = 0),
  CHECK (is_identity = 0 OR (is_nullable = 0 AND default_value = '')),
  FOREIGN KEY (schema_name, table_name) REFERENCES metadata_tables (schema_name, table_name) ON DELETE CASCADE
);
'''


def text(value: Any) -> str:
    return '' if value is None or pd.isna(value) else str(value)


def integer(value: Any, default: int = 0) -> int:
    return default if value is None or pd.isna(value) else int(value)


def db2_type(row: dict) -> str:
    """Convert catalog fields into a SQL type declaration (not full DDL)."""
    kind = text(row['type_name']).strip().upper()
    length = integer(row.get('type_length'))
    scale = integer(row.get('type_scale'))
    type_schema = text(row.get('type_schema')).strip()
    if type_schema and type_schema.upper() != 'SYSIBM':
        raise ValueError(f'사용자 정의 타입은 직접 매핑하세요: {type_schema}.{kind}')
    if kind in {'DECIMAL', 'NUMERIC'}:
        return f'{kind}({length},{scale})'
    if kind == 'TIMESTAMP':
        return f'TIMESTAMP({scale})'
    if kind == 'DECFLOAT':
        if length not in {8, 16}:
            raise ValueError(f'DECFLOAT 길이 확인 필요: {length}')
        return f'DECFLOAT({16 if length == 8 else 34})'
    character = {'CHAR', 'CHARACTER', 'VARCHAR', 'CHARACTER VARYING', 'GRAPHIC', 'VARGRAPHIC', 'CLOB', 'DBCLOB'}
    if kind in character:
        units = text(row.get('string_units')).strip().upper()
        declared = integer(row.get('string_length'))
        # STRINGUNITSLENGTH gives declared units, whereas LENGTH can be bytes.
        size = declared or (length // 2 if kind in {'GRAPHIC', 'VARGRAPHIC', 'DBCLOB'} else length)
        suffix = ''
        if units:
            if units not in {'OCTETS', 'CODEUNITS16', 'CODEUNITS32'}:
                raise ValueError(f'알 수 없는 문자열 길이 단위: {units}')
            default_units = 'CODEUNITS16' if kind in {'GRAPHIC', 'VARGRAPHIC', 'DBCLOB'} else 'OCTETS'
            suffix = '' if units == default_units else ' ' + units
            if suffix:
                LOG.warning('%s.%s: %s 길이 단위를 보존합니다. ERD 자리수 편집/다른 DBMS 출력 시 확인하세요.', row.get('table_name'), row.get('column_name'), units)
        bit_data = ' FOR BIT DATA' if kind in {'CHAR', 'CHARACTER', 'VARCHAR', 'CHARACTER VARYING'} and integer(row.get('code_page'), -1) == 0 else ''
        if bit_data:
            suffix = ''
        return f'{kind}({size}{suffix}){bit_data}'
    if kind in {'BINARY', 'VARBINARY', 'BLOB'}:
        return f'{kind}({length})'
    return kind


class Db2ToKjaErd:
    def __init__(self, sqlite_path: str | Path, *, connection=None,
                 query_df: Callable[[str, tuple], pd.DataFrame] | None = None):
        if (connection is None) == (query_df is None):
            raise ValueError('connection 또는 query_df 중 하나만 전달하세요.')
        self.sqlite_path = Path(sqlite_path).expanduser().resolve()
        self.connection = connection
        self.query_df = query_df

    def _query(self, sql: str, params: tuple) -> pd.DataFrame:
        if self.query_df is not None:
            result = self.query_df(sql, params)
            if not isinstance(result, pd.DataFrame):
                raise TypeError('query_df는 pandas.DataFrame을 반환해야 합니다.')
            result = result.copy()
        else:
            cursor = self.connection.cursor()
            try:
                cursor.execute(sql, params)
                result = pd.DataFrame.from_records(cursor.fetchall(), columns=[str(d[0]) for d in cursor.description])
            finally:
                cursor.close()
        result.columns = [str(c).lower() for c in result.columns]
        if result.columns.duplicated().any():
            raise ValueError('조회 결과에 중복 컬럼명이 있습니다.')
        return result

    def fetch_metadata(self, schema: str, table_names: list[str] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
        """Read ordinary tables only. None=whole schema, [] is rejected."""
        if not isinstance(schema, str) or not schema.strip() or schema != schema.strip():
            raise ValueError('스키마명을 정확한 대소문자로 입력하세요. 예: APP')
        if table_names is not None:
            if not table_names or len(table_names) > 500 or any(not isinstance(t, str) or not t.strip() or t != t.strip() for t in table_names):
                raise ValueError('table_names는 공백 없는 테이블명 1~500개 또는 None입니다.')
            table_names = list(dict.fromkeys(table_names))
        params = (schema, *(table_names or []))
        condition = 'AND t.TABNAME IN (' + ','.join('?' for _ in table_names) + ')' if table_names else ''
        tables = self._query(TABLE_SQL.format(table_filter=condition), params)
        raw = self._query(COLUMN_SQL.format(table_filter=condition), params)
        if tables.empty:
            raise ValueError('조회된 테이블이 없습니다. 스키마·테이블명·카탈로그 조회 권한을 확인하세요.')
        if table_names is not None:
            missing = set(table_names) - set(tables['table_name'].map(str))
            if missing:
                raise ValueError(f'조회되지 않은 테이블: {sorted(missing)}. SQLite에는 반영하지 않습니다.')
        rows = []
        for row in raw.to_dict('records'):
            identity = integer(row['is_identity'])
            generated = text(row.get('generated_kind')).strip()
            if generated and not identity:
                LOG.warning('%s.%s: 계산식/자동생성 속성은 ERD 메타 스키마에 저장할 수 없습니다.', row['table_name'], row['column_name'])
            rows.append({
                'schema_name': text(row['schema_name']), 'table_name': text(row['table_name']),
                'ordinal_position': integer(row['ordinal_position']),
                'column_name': text(row['column_name']), 'logical_name': text(row['logical_name']),
                'data_type': db2_type(row), 'is_pk': integer(row['is_pk']),
                'is_nullable': 0 if integer(row['is_pk']) or identity else integer(row['is_nullable']),
                'is_unique': integer(row['is_unique']),
                'default_value': '' if identity or generated else text(row['default_value']),
                'is_identity': identity, 'identity_mode': 'ALWAYS' if identity and generated == 'A' else 'BY DEFAULT',
            })
        tables = tables[TABLE_FIELDS].map(text)
        columns = pd.DataFrame(rows, columns=COLUMN_FIELDS)
        self._validate(tables, columns)
        LOG.info('DB2 조회: 테이블 %s개 / 컬럼 %s개', len(tables), len(columns))
        return tables, columns

    @staticmethod
    def _validate(tables: pd.DataFrame, columns: pd.DataFrame) -> None:
        for frame, fields in [(tables, TABLE_FIELDS), (columns, COLUMN_FIELDS)]:
            missing = set(fields) - set(frame.columns)
            if missing:
                raise ValueError(f'DataFrame 필수 컬럼 누락: {sorted(missing)}')
            if frame[fields].isna().any().any():
                raise ValueError('DataFrame 필수 필드에 NULL/NaN이 있습니다.')
        if tables.empty or columns.empty:
            raise ValueError('빈 조회 결과는 저장하지 않습니다.')
        # SQLite uses NOCASE for metadata keys; refuse name collisions before writing.
        key = lambda s, t: (str(s).casefold(), str(t).casefold())
        table_keys = [key(s, t) for s, t in tables[['schema_name', 'table_name']].itertuples(index=False, name=None)]
        if len(set(table_keys)) != len(table_keys):
            raise ValueError('스키마/테이블명이 중복됩니다(대소문자 포함).')
        column_keys = {key(s, t) for s, t in columns[['schema_name', 'table_name']].itertuples(index=False, name=None)}
        if set(table_keys) != column_keys:
            raise ValueError('컬럼 없는 테이블 또는 부모 테이블 없는 컬럼이 있습니다. 조회 중 DDL이 변경됐는지 확인하세요.')

    def save(self, tables_df: pd.DataFrame, columns_df: pd.DataFrame) -> dict:
        """Atomic per-table refresh. Never drops catalog/project tables.

        Only returned tables are upserted. Their old column rows are replaced,
        including removal of columns absent from this snapshot. Other tables
        (including DB2 tables dropped since a previous run) are left untouched.
        """
        self._validate(tables_df, columns_df)
        if not self.sqlite_path.is_file():
            raise FileNotFoundError(f'{self.sqlite_path}: KJA ERD를 먼저 실행하거나 기존 erd.sqlite 경로를 지정하세요.')
        table_rows = [tuple(str(v) for v in row) for row in tables_df[TABLE_FIELDS].itertuples(index=False, name=None)]
        column_rows = []
        numeric = {'ordinal_position', 'is_pk', 'is_nullable', 'is_unique', 'is_identity'}
        for row in columns_df[COLUMN_FIELDS].itertuples(index=False, name=None):
            # Convert numpy scalars to Python int/str before sqlite3 binding.
            values = []
            for field, value in zip(COLUMN_FIELDS, row):
                if field in numeric:
                    n = int(value)
                    if n != value:
                        raise ValueError(f'{field}: 정수만 허용합니다 ({value})')
                    values.append(n)
                else:
                    values.append(str(value))
            column_rows.append(tuple(values))
        target = sqlite3.connect(self.sqlite_path, timeout=30, isolation_level=None)
        try:
            target.execute('PRAGMA foreign_keys=ON')
            target.execute('PRAGMA busy_timeout=30000')
            target.executescript('BEGIN IMMEDIATE;\n' + SQLITE_SCHEMA)
            target.executemany('''INSERT INTO metadata_tables (schema_name, table_name, logical_name)
                VALUES (?, ?, ?) ON CONFLICT (schema_name, table_name)
                DO UPDATE SET logical_name=excluded.logical_name''', table_rows)
            # Delete all columns for each selected table before inserting so ordinal swaps work.
            target.executemany('DELETE FROM metadata_columns WHERE schema_name=? AND table_name=?', [r[:2] for r in table_rows])
            placeholders = ','.join('?' for _ in COLUMN_FIELDS)
            target.executemany(f'INSERT INTO metadata_columns ({",".join(COLUMN_FIELDS)}) VALUES ({placeholders})', column_rows)
            target.execute('COMMIT')
        except Exception:
            if target.in_transaction:
                target.execute('ROLLBACK')
            raise
        finally:
            target.close()
        result = {'sqlite_path': str(self.sqlite_path), 'tables': len(table_rows), 'columns': len(column_rows)}
        LOG.info('SQLite 반영 완료: %s', result)
        return result


# ---- Edit configuration here; do not put passwords in this file. ----
SQLITE_PATH = Path(r'C:\tools\kja-erd\data\erd.sqlite')
DB2_SCHEMA = 'APP'                 # exact catalog case; no automatic uppercasing
TABLE_NAMES = ['CUSTOMER', 'CUSTOMER_REVIEW']  # None = all ordinary tables in schema
DRY_RUN = True                    # inspect DataFrames; set False to write SQLite


def get_db2_connection():
    """Replace this function using your existing class.

    Example only (change module/class/method to the real names):
        from my_db2 import Db2Client
        client = Db2Client(...)
        return client.connect()  # must return a DB-API connection with cursor()

    If connect() returns None/bool, return client.conn instead.
    A raw java.sql.Connection is not a DB-API connection; use query_df instead.
    """
    raise NotImplementedError('get_db2_connection()에 기존 DB2 JDBC 클래스 연결 코드를 넣으세요.')


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    conn = get_db2_connection()
    try:
        sync = Db2ToKjaErd(SQLITE_PATH, connection=conn)
        tables_df, columns_df = sync.fetch_metadata(DB2_SCHEMA, TABLE_NAMES)
        print('\n[metadata_tables]\n' + tables_df.to_string(index=False))
        print('\n[metadata_columns]\n' + columns_df.to_string(index=False))
        if DRY_RUN:
            print('\n미리보기 완료. DRY_RUN=False로 변경하면 SQLite에 반영합니다.')
        else:
            print(sync.save(tables_df, columns_df))
    finally:
        conn.close()


if __name__ == '__main__':
    main()
