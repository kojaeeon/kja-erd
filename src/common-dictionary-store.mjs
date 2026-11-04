import {synchronize,dictionaryErrors,validate} from './model.js';

export class CommonDictionaryStore {
  constructor(db){this.db=db;this.hasProjects=()=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS shared_words(id TEXT PRIMARY KEY,logical TEXT NOT NULL,physical TEXT NOT NULL,description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS shared_domains(id TEXT PRIMARY KEY,name TEXT NOT NULL,sql_type TEXT NOT NULL,length TEXT NOT NULL DEFAULT '',scale TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS shared_terms(id TEXT PRIMARY KEY,logical TEXT NOT NULL,physical TEXT NOT NULL,domain_id TEXT REFERENCES shared_domains(id),length TEXT NOT NULL DEFAULT '',scale TEXT NOT NULL DEFAULT '',description TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS shared_term_words(term_id TEXT NOT NULL REFERENCES shared_terms(id),word_id TEXT NOT NULL REFERENCES shared_words(id),position INTEGER NOT NULL,PRIMARY KEY(term_id,position),UNIQUE(term_id,word_id));
    CREATE TABLE IF NOT EXISTS shared_dictionary_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
    INSERT OR IGNORE INTO shared_dictionary_meta VALUES(1,0);
    CREATE UNIQUE INDEX IF NOT EXISTS shared_words_physical ON shared_words(physical COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS shared_words_logical ON shared_words(logical COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS shared_domains_name ON shared_domains(name COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS shared_terms_physical ON shared_terms(physical COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS shared_terms_logical ON shared_terms(logical COLLATE NOCASE);`);}
  read(includeUsage=false){const db=this.db,links=db.prepare('SELECT * FROM shared_term_words ORDER BY term_id,position').all();const byTerm=new Map();for(const link of links){if(!byTerm.has(link.term_id))byTerm.set(link.term_id,[]);byTerm.get(link.term_id).push(link.word_id);}const result={revision:db.prepare('SELECT revision FROM shared_dictionary_meta WHERE id=1').get().revision,
    words:db.prepare('SELECT id,logical,physical,description FROM shared_words ORDER BY rowid').all(),
    types:db.prepare('SELECT id,name,sql_type AS type,length,scale,description FROM shared_domains ORDER BY rowid').all(),
    terms:db.prepare('SELECT id,logical,physical,domain_id AS typeId,length,scale,description FROM shared_terms ORDER BY rowid').all().map(t=>({...t,typeId:t.typeId||'',wordIds:byTerm.get(t.id)||[]}))};
    if(includeUsage)result.usageTables=this.hasProjects()?db.prepare('SELECT name,document FROM projects WHERE deleted_at IS NULL').all().flatMap(row=>{const doc=JSON.parse(row.document);return doc.tables.map(t=>({...t,name:row.name+' / '+t.name,columns:t.columns.map(c=>({...c,termId:c.termId?.startsWith('shared:terms:')?c.termId.slice(13):''}))}));}):[];
    return result;
  }
  save(payload){const db=this.db;if(!Number.isInteger(payload?.revision))throw Error('공용 사전 버전이 없습니다. 다시 불러오세요.');
    const data=structuredClone(payload);for(const kind of ['words','types','terms'])if(!Array.isArray(data[kind])||data[kind].length>10000)throw Error('사전 목록은 종류별 10000개까지 저장할 수 있습니다.');
    const ids=new Set();for(const item of [...data.words,...data.types,...data.terms]){if(typeof item.id!=='string'||!item.id||item.id.startsWith('shared:')||ids.has(item.id))throw Error('사전 항목 ID가 올바르지 않거나 중복됩니다.');ids.add(item.id);for(const field of ['logical','physical','name','type','description','length','scale'])if(item[field]!=null&&(typeof item[field]!=='string'&&(!['length','scale'].includes(field)||typeof item[field]!=='number')||String(item[field]).length>10000))throw Error('사전 값의 형식/길이를 확인하세요.');}
    for(const term of data.terms){if(term.typeId&&!data.types.some(t=>t.id===term.typeId))throw Error('공용 용어의 도메인 참조가 없습니다.');if(!Array.isArray(term.wordIds)||new Set(term.wordIds).size!==term.wordIds.length||term.wordIds.some(id=>!data.words.some(w=>w.id===id)))throw Error('공용 용어의 단어 참조가 올바르지 않습니다.');}
    const dictionary=synchronize({version:1,id:'common',name:'공용 사전',dialect:'db2',tables:[],relations:[],notes:[],words:data.words,types:data.types,terms:data.terms});const errors=dictionaryErrors(dictionary);if(errors.length)throw Error(errors.join('\n'));
    // Check both logical and physical conflict keys within a scope, never overwrite silently.
    for(const kind of ['words','terms']){const logical=new Set();for(const item of dictionary[kind]){const name=item.logical.trim().toLowerCase();if(logical.has(name))throw Error('공용 사전에 같은 논리명이 중복됩니다: '+item.logical);logical.add(name);}}
    db.exec('BEGIN IMMEDIATE');try{
      if(this.read().revision!==data.revision){const e=Error('다른 창에서 공용 사전이 변경되었습니다. 다시 불러온 후 적용하세요.');e.status=409;throw e;}
      db.exec('DELETE FROM shared_term_words;DELETE FROM shared_terms;DELETE FROM shared_words;DELETE FROM shared_domains;');
      const str=v=>v==null?'':String(v);
      for(const w of dictionary.words)db.prepare('INSERT INTO shared_words VALUES(?,?,?,?)').run(w.id,w.logical,w.physical,str(w.description));
      for(const t of dictionary.types)db.prepare('INSERT INTO shared_domains VALUES(?,?,?,?,?,?)').run(t.id,t.name,t.type,str(t.length),str(t.scale),str(t.description));
      for(const t of dictionary.terms){db.prepare('INSERT INTO shared_terms VALUES(?,?,?,?,?,?,?)').run(t.id,t.logical,t.physical,t.typeId||null,str(t.length),str(t.scale),str(t.description));t.wordIds.forEach((id,i)=>db.prepare('INSERT INTO shared_term_words VALUES(?,?,?)').run(t.id,id,i));}
      db.exec('UPDATE shared_dictionary_meta SET revision=revision+1 WHERE id=1');const common=this.read();let changed=0;
      for(const row of (this.hasProjects()?db.prepare('SELECT id,document FROM projects').all():[])){const original=JSON.parse(row.document);if(!original.tables.some(t=>t.columns.some(c=>c.termId?.startsWith('shared:')))&&!original.terms.some(t=>t.typeId?.startsWith('shared:')||t.wordIds?.some(id=>id.startsWith('shared:'))))continue;const updated=synchronize({...structuredClone(original),commonDictionary:common});delete updated.commonDictionary;validate(updated);if(JSON.stringify(updated)===JSON.stringify(original))continue;
        const date=new Date().toISOString(),body=JSON.stringify(updated);db.prepare('UPDATE projects SET document=?,updated_at=? WHERE id=?').run(body,date,row.id);db.prepare('INSERT INTO revisions(project_id,document,created_at) VALUES(?,?,?)').run(row.id,body,date);db.prepare('DELETE FROM revisions WHERE project_id=? AND id NOT IN (SELECT id FROM revisions WHERE project_id=? ORDER BY id DESC LIMIT 30)').run(row.id,row.id);changed++;
      }
      db.exec('COMMIT');return {...this.read(true),updatedProjects:changed};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
}
