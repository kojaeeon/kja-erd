import {readFileSync} from 'node:fs';

function metadataError(message, status) {
  return Object.assign(new Error(message), {status});
}

function catalogText(value, label, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || value.includes('\0') || (required && !value.trim())) {
    throw Error(`${label}은(는) ${required ? '비어 있지 않은 ' : ''}${limit}자 이내의 문자열이어야 합니다.`);
  }
  return value;
}

function catalogKey(value) {
  return [
    catalogText(value?.schema ?? '', '스키마', 128).trim(),
    catalogText(value?.name, '테이블명', 256, true).trim(),
  ];
}

function catalogEntry(value) {
  const [schema, name] = catalogKey(value);
  const logical = catalogText(value.logical ?? '', '테이블 논리명', 4096);
  if (!Array.isArray(value.columns) || !value.columns.length || value.columns.length > 10000) {
    throw Error('컬럼을 1개 이상 10000개 이하로 입력하세요.');
  }
  const names = new Set();
  const columns = value.columns.map((column, index) => {
    const label = `${index + 1}번째 컬럼`;
    const name = catalogText(column?.name, `${label} 물리명`, 256, true).trim();
    // Match SQLite NOCASE, which folds ASCII letters only.
    const key = name.replace(/[A-Z]/g, letter => letter.toLowerCase());
    if (names.has(key)) throw Error(`중복 컬럼명: ${name}`);
    names.add(key);
    const logical = catalogText(column.logical ?? '', `${label} 논리명`, 4096);
    const type = catalogText(column.type, `${label} 타입`, 4096, true).trim();
    const defaultValue = catalogText(column.default ?? '', `${label} 기본값`, 4096).trim();
    const {pk = false, ai = false, unique = false, nullable = true, identityMode = 'BY DEFAULT'} = column;
    if ([pk, ai, unique, nullable].some(flag => typeof flag !== 'boolean')) {
      throw Error(`${label}의 PK, NULL, UNIQUE, IDENTITY는 체크 여부로 입력하세요.`);
    }
    if (!['BY DEFAULT', 'ALWAYS'].includes(identityMode)) throw Error(`${label}의 IDENTITY 모드를 확인하세요.`);
    if (ai && defaultValue) throw Error(`${label}은(는) IDENTITY와 기본값을 함께 사용할 수 없습니다.`);
    return {name, logical, type, defaultValue, pk, ai, unique, nullable: !pk && !ai && nullable, identityMode};
  });
  return {schema, name, logical, columns};
}

/** User-maintained catalog, separate from ERD project documents and physical DB tables. */
export class MetadataStore {
  constructor(db) {
    this.db = db;
    db.exec(readFileSync(new URL('./metadata-schema.sql', import.meta.url), 'utf8'));
  }
  write(entry, previous) {
    const table = catalogEntry(entry);
    const original = previous === undefined ? null : catalogKey(previous);
    const {db} = this;
    db.exec('BEGIN IMMEDIATE');
    try {
      const find = db.prepare('SELECT schema_name, table_name FROM metadata_tables WHERE schema_name = ? AND table_name = ?');
      const existing = original && find.get(...original);
      const destination = find.get(table.schema, table.name);
      if (original && !existing) {
        throw metadataError('메타데이터 테이블을 찾을 수 없습니다. 목록을 다시 조회하세요.', 404);
      }
      if (destination && (destination.schema_name !== existing?.schema_name || destination.table_name !== existing?.table_name)) {
        throw metadataError('같은 스키마와 테이블명이 이미 등록되어 있습니다. 메타데이터 관리에서 기존 항목을 수정하세요.', 409);
      }
      if (original) {
        db.prepare('DELETE FROM metadata_columns WHERE schema_name = ? AND table_name = ?').run(...original);
        db.prepare('UPDATE metadata_tables SET schema_name = ?, table_name = ?, logical_name = ? WHERE schema_name = ? AND table_name = ?')
          .run(table.schema, table.name, table.logical, ...original);
      } else {
        db.prepare('INSERT INTO metadata_tables (schema_name, table_name, logical_name) VALUES (?, ?, ?)')
          .run(table.schema, table.name, table.logical);
      }
      const addColumn = db.prepare(`INSERT INTO metadata_columns (
        schema_name, table_name, ordinal_position, column_name, logical_name, data_type,
        is_pk, is_nullable, is_unique, default_value, is_identity, identity_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      table.columns.forEach((column, index) => addColumn.run(
        table.schema, table.name, index + 1, column.name, column.logical, column.type,
        Number(column.pk), Number(column.nullable), Number(column.unique),
        column.defaultValue, Number(column.ai), column.identityMode,
      ));
      db.exec('COMMIT');
      return {schema: table.schema, name: table.name};
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  remove(entry) {
    const {changes} = this.db.prepare('DELETE FROM metadata_tables WHERE schema_name = ? AND table_name = ?').run(...catalogKey(entry));
    if (!changes) throw metadataError('메타데이터 테이블을 찾을 수 없습니다. 목록을 다시 조회하세요.', 404);
    return {deleted: true};
  }
  read({schema = '', search = ''} = {}) {
    if (typeof schema !== 'string' || typeof search !== 'string' || schema.length > 128 || search.length > 256)
      throw Error('스키마는 128자, 검색어는 256자 이내로 입력하세요.');
    const db = this.db;
    // A single read transaction also protects against edits from an external SQLite client.
    db.exec('BEGIN');
    try {
      const rows = db.prepare(`SELECT * FROM metadata_tables
        WHERE (? = '' OR schema_name = ? COLLATE NOCASE)
          AND (? = '' OR instr(lower(table_name), lower(?)) > 0 OR instr(lower(logical_name), lower(?)) > 0)
        ORDER BY schema_name, table_name LIMIT 501`).all(schema.trim(), schema.trim(), search.trim(), search.trim(), search.trim());
      if (rows.length > 500) throw Error('조회 결과가 500개를 초과합니다. 스키마나 테이블 검색어를 입력하세요.');
      const getColumns = db.prepare(`SELECT * FROM metadata_columns
        WHERE schema_name = ? COLLATE NOCASE AND table_name = ? COLLATE NOCASE ORDER BY ordinal_position LIMIT 10001`);
      const diagnostics = [];
      let count = 0;
      const tables = rows.map(t => {
        const columns = getColumns.all(t.schema_name, t.table_name);
        count += columns.length;
        if (count > 10000) throw Error('조회 컬럼이 10000개를 초과합니다. 검색 범위를 좁혀주세요.');
        const valid = columns.length > 0;
        if (!valid) diagnostics.push({level:'error', line:0, table:[t.schema_name,t.table_name].filter(Boolean).join('.'), message:'등록된 컬럼이 없습니다. metadata_columns에 컬럼을 입력하세요.'});
        return {
          schema:t.schema_name, name:t.table_name, logical:t.logical_name,
          key:JSON.stringify([t.schema_name,t.table_name]), valid, indexes:[], foreignKeys:[],
          columns:columns.map(c => ({
            name:c.column_name, logical:c.logical_name, type:c.data_type.trim(),
            pk:!!c.is_pk, nullable:!c.is_pk && !c.is_identity && !!c.is_nullable,
            unique:!!c.is_unique, default:c.default_value, ai:!!c.is_identity, identityMode:c.identity_mode,
          })),
        };
      });
      db.exec('COMMIT');
      return {source:'sqlite-metadata', tables, diagnostics, statementCount:0};
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
