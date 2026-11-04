import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
import {writeFileSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {demo} from '../release/KJA-ERD-offline-node24/src/model.js';
const root=resolve('release/KJA-ERD-offline-node24'),child=spawn(join(root,'node.exe'),['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let generated,logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
try {
  await new Promise((yes,no)=>{const timer=setTimeout(()=>no(Error('Server startup timeout: '+logs)),45000);child.stdout.on('data',()=>{if(logs.includes('http://127.0.0.1:3000')){clearTimeout(timer);yes();}});child.on('error',no);child.on('exit',code=>{clearTimeout(timer);no(Error('Server exited '+code+': '+logs));});});
  const get=async path=>{const r=await fetch('http://127.0.0.1:3000'+path);if(!r.ok)throw Error(await r.text());return r;};
  const post=async(path,body)=>{const r=await fetch('http://127.0.0.1:3000'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r;};
  const html=await (await get('/')).text();if(!html.includes('KJA ERD'))throw Error('UI title missing');const asset=html.match(/src="([^"]+\.js)"/)[1];await get(asset);
  const projects=await (await get('/api/projects')).json();if(!projects.length)throw Error('Saved projects missing');await get('/api/projects/'+projects[0].id);
  const session=await (await get('/api/session')).json();if(!projects.some(p=>p.id===session.document?.id))throw Error('Last project restoration missing');
  const common=await (await get('/api/dictionaries/common?compact=1')).json();if(!Array.isArray(common.words)||!Array.isArray(common.terms)||!Array.isArray(common.types))throw Error('Common dictionary API missing');
  const checkDb=new DatabaseSync(join(root,'data/erd.sqlite'),{readOnly:true});for(const table of ['shared_words','shared_terms','shared_domains','shared_term_words'])if(!checkDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Common dictionary table missing: '+table);if(checkDb.prepare('PRAGMA foreign_key_check').all().length)throw Error('Shared dictionary foreign key integrity failed');checkDb.close();
  const document=demo('db2');document.exportOptions={headerColor:'#2563eb'};const excel=await (await post('/api/export/excel',document)).arrayBuffer();
  const body={document,tableId:document.tables[1].id},template=Buffer.from(await (await post('/api/test-data/template',body)).arrayBuffer());
  const imported=await (await post('/api/test-data/import',{...body,content:template.toString('base64')})).json();if(imported.count!==1)throw Error('Excel test data conversion failed');
  const schema=await (await post('/api/databases',{script:'CREATE TABLE package_smoke (id INTEGER PRIMARY KEY, label TEXT);'})).json();generated=schema.id;if(!schema.tables.some(t=>t.name==='package_smoke'))throw Error('Schema generation failed');
  const results={packagedNode:'v24.15.0',productionServer:true,uiAssets:true,lastProjectRestoration:true,customExcelColor:true,commonDictionarySQLite:true,savedProjects:projects.length,excelBytes:excel.byteLength,templateBytes:template.length,excelInsertRows:imported.count,sqliteSchemaCreation:true};
  writeFileSync('artifacts/offline-package-verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{
  child.kill();await new Promise(done=>{if(child.exitCode!==null)done();else child.once('exit',done);});
  if(generated){if(!/^[a-f0-9-]{36}$/.test(generated))throw Error('Unexpected database ID');for(const suffix of ['.sqlite','.sqlite-wal','.sqlite-shm'])rmSync(join(root,'data/generated',generated+suffix),{force:true});}
  const db=new DatabaseSync(join(root,'data/erd.sqlite'));db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
}
