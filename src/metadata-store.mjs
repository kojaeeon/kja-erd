import {readFileSync} from 'node:fs';

/** User-maintained catalog, separate from ERD project documents and physical DB tables. */
export class MetadataStore {
  constructor(db) {
    this.db = db;
    db.exec(readFileSync(new URL('./metadata-schema.sql', import.meta.url), 'utf8'));
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
