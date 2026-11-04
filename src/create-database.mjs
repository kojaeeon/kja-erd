import {DatabaseSync,constants as C} from 'node:sqlite';
import {mkdirSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

// Each execution creates a new database; schema operations never touch the ERD store.
export function createDatabase(script,directory) {
  if(typeof script!=='string'||!script.trim()||script.length>1_000_000)throw new Error('1MB 이하의 SQL 스크립트를 입력하세요.');
  mkdirSync(directory,{recursive:true});const id=randomUUID();const path=resolve(directory,id+'.sqlite');const db=new DatabaseSync(path,{allowExtension:false});
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN');
    let tablesCreated=0;
    db.setAuthorizer((action,a,b,dbName)=>{
      if(dbName&&dbName!=='main')return C.SQLITE_DENY;
      if(action===C.SQLITE_CREATE_TABLE){if(++tablesCreated>500)return C.SQLITE_DENY;return C.SQLITE_OK;}
      if([C.SQLITE_CREATE_INDEX,C.SQLITE_REINDEX,C.SQLITE_READ].includes(action))return C.SQLITE_OK;
      if([C.SQLITE_INSERT,C.SQLITE_UPDATE].includes(action)&&['sqlite_master','sqlite_schema'].includes(a))return C.SQLITE_OK;
      if(action===C.SQLITE_PRAGMA&&a==='foreign_keys'&&['ON','1'].includes(String(b).toUpperCase()))return C.SQLITE_OK;
      return C.SQLITE_DENY;
    });
    db.exec(script);db.setAuthorizer(null);
    const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t=>({...t,columns:db.prepare('SELECT name,type,pk,"notnull",dflt_value FROM pragma_table_info(?) ORDER BY cid').all(t.name),foreignKeys:db.prepare('SELECT * FROM pragma_foreign_key_list(?) ORDER BY id,seq').all(t.name),indexes:db.prepare('SELECT name,"unique",origin FROM pragma_index_list(?)').all(t.name).filter(ix=>ix.origin!=='pk').map(ix=>({...ix,columns:db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(ix.name).map(c=>c.name)}))}));
    if(!tables.length)throw new Error('생성된 테이블이 없습니다. CREATE TABLE 스크립트를 확인하세요.');
    // Compile an INSERT without executing it to detect invalid FK parent keys/columns.
    for(const t of tables){const quoted='"'+t.name.replaceAll('"','""')+'"';db.prepare(`EXPLAIN INSERT INTO ${quoted} DEFAULT VALUES`).all();}
    db.exec('COMMIT');db.close();return {id,path,tables};
  } catch(error) {
    db.setAuthorizer(null);try{db.exec('ROLLBACK');}catch{}db.close();rmSync(path,{force:true});
    throw new Error(error.message.includes('authorized')?'테이블·인덱스 생성 SQL만 실행할 수 있습니다.':error.message);
  }
}
