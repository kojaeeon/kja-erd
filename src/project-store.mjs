import {CommonDictionaryStore} from './common-dictionary-store.mjs';
import {copyProject,validate,synchronize} from './model.js';

export class ProjectStore {
  constructor(db) {
    this.db=db;
    db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,document TEXT NOT NULL,created_at TEXT NOT NULL);`);
    if(!db.prepare('PRAGMA table_info(projects)').all().some(c=>c.name==='deleted_at'))db.exec('ALTER TABLE projects ADD COLUMN deleted_at TEXT');
    db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
    this.common=new CommonDictionaryStore(db);
  }
  rememberOpened(id) {
    this.get(id);
    this.db.prepare("INSERT INTO app_settings(key,value) VALUES('last_project',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(id);
    return {projectId:id};
  }
  startup() {
    const id=this.db.prepare("SELECT value FROM app_settings WHERE key='last_project'").get()?.value;
    const row=this.db.prepare('SELECT document,updated_at FROM projects WHERE id=? AND deleted_at IS NULL').get(id||'')||this.db.prepare('SELECT document,updated_at FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1').get();
    return {document:row?this.hydrate(JSON.parse(row.document)):null,commonDictionary:this.common.read(),updatedAt:row?.updated_at||null,deletedIds:this.list(true).map(p=>p.id)};
  }
  list(trash=false) {return this.db.prepare(`SELECT id,name,updated_at,deleted_at FROM projects WHERE deleted_at IS ${trash?'NOT ':''}NULL ORDER BY ${trash?'deleted_at':'updated_at'} DESC`).all();}
  hydrate(document){const common=this.common.read();return common.revision?synchronize({...document,commonDictionary:common}):document;}
  get(id) {const row=this.db.prepare('SELECT document FROM projects WHERE id=? AND deleted_at IS NULL').get(id);if(!row)throw Error('프로젝트가 없거나 휴지통에 있습니다.');return this.hydrate(JSON.parse(row.document));}
  save(id,document) {
    validate(document);if(document.id!==id)throw Error('프로젝트 ID가 일치하지 않습니다.');
    const common=this.common.read();document=structuredClone(document);if(common.revision||document.tables.some(t=>t.columns.some(c=>c.termId?.startsWith('shared:'))))synchronize({...document,commonDictionary:common});delete document.commonDictionary;
    const date=new Date().toISOString(),body=JSON.stringify(document),db=this.db;
    db.exec('BEGIN');
    try {
      if(db.prepare('SELECT deleted_at FROM projects WHERE id=?').get(id)?.deleted_at)throw Error('휴지통에 있는 프로젝트는 저장할 수 없습니다. 먼저 복원하세요.');
      db.prepare('INSERT INTO projects(id,name,document,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,document=excluded.document,updated_at=excluded.updated_at').run(id,document.name,body,date);
      db.prepare('INSERT INTO revisions(project_id,document,created_at) VALUES(?,?,?)').run(id,body,date);
      db.prepare('DELETE FROM revisions WHERE project_id=? AND id NOT IN (SELECT id FROM revisions WHERE project_id=? ORDER BY id DESC LIMIT 30)').run(id,id);
      db.exec('COMMIT');return {savedAt:date,commonDictionary:common};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  copy(id) {const document=copyProject(this.get(id));this.save(document.id,document);return document;}
  trash(id) {
    const result=this.db.prepare('UPDATE projects SET deleted_at=? WHERE id=? AND deleted_at IS NULL').run(new Date().toISOString(),id);
    if(!result.changes)throw Error('삭제할 프로젝트가 없습니다.');return {deleted:true};
  }
  restore(id) {
    const result=this.db.prepare('UPDATE projects SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL').run(id);
    if(!result.changes)throw Error('복원할 프로젝트가 없습니다.');return this.get(id);
  }
}
