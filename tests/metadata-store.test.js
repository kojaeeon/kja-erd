import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MetadataStore} from '../src/metadata-store.mjs';
import {planDb2Import} from '../src/db2-import.js';
import {blank,validate} from '../src/model.js';
const example=readFileSync(new URL('../docs/metadata-example.sql',import.meta.url),'utf8');
const choices=a=>Object.fromEntries(a.tables.map(t=>[t.key,{selected:t.valid,mode:'skip',rename:t.name+'_copy'}]));

test('initialization creates an empty catalog without altering existing data; example is repeatable',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec("CREATE TABLE existing_data (value TEXT); INSERT INTO existing_data VALUES ('keep');");
    const store=new MetadataStore(db);assert.deepEqual(store.read().tables,[]);
    db.exec(example);db.exec(example);new MetadataStore(db);
    const a=store.read();assert.equal(a.tables.length,2);assert.equal(a.tables[0].columns.length,3);
    assert.equal(db.prepare('SELECT value FROM existing_data').get().value,'keep');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});

test('catalog maps ordinal, logical names, precision, defaults, identity and only selected tables into valid ERD',()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new MetadataStore(db);db.exec(example);const a=store.read(),selection=choices(a);
    assert.equal(a.tables[0].logical,'고객');assert.equal(a.tables[0].columns[2].default,"'Y'");
    assert.equal(a.tables[1].columns[2].type,'DECIMAL(15,2)');
    assert.equal(a.tables[1].columns[0].ai,true);assert.equal(a.tables[1].columns[0].identityMode,'ALWAYS');
    selection[a.tables[1].key].selected=false;
    const doc=blank(),before=structuredClone(doc),plan=planDb2Import(doc,a,selection);
    assert.deepEqual(doc,before);assert.equal(plan.added,1);validate(plan.document);
    assert.deepEqual(plan.document.tables[0].columns.map(c=>c.name),['CUSTOMER_ID','CUSTOMER_NAME','USE_YN']);
    assert.equal(plan.document.tables[0].columns[0].nullable,false);
    assert.equal(plan.document.tables[0].logical,'고객');assert.equal(plan.document.tables[0].columns[1].logical,'고객명');
    const skip=planDb2Import(plan.document,a,selection);assert.equal(skip.added,0);assert.equal(skip.updated,0);
    selection[a.tables[0].key].mode='update';a.tables[0].columns[1].type='VARCHAR(200)';
    const update=planDb2Import(plan.document,a,selection);assert.equal(update.updated,1);
    assert.deepEqual(update.document.tables[0].position,plan.document.tables[0].position);
    assert.equal(update.document.tables[0].columns[1].id,plan.document.tables[0].columns[1].id);
    assert.equal(update.document.tables[0].columns[1].type,'VARCHAR(200)');
  }finally{db.close();}
});

test('schema filter is exact; search is literal, handles quotes, and reads externally committed updates',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kja-metadata-'));const file=join(dir,'test.sqlite');
  const db=new DatabaseSync(file);let other;
  try{
    const store=new MetadataStore(db);db.exec(example);other=new DatabaseSync(file);
    assert.equal(store.read({schema:'app',search:'customer'}).tables.length,2);
    assert.equal(store.read({search:'정기점검'}).tables.length,1);
    assert.equal(store.read({schema:'AP'}).tables.length,0);
    assert.equal(store.read({search:"%' OR 1=1 --"}).tables.length,0);
    other.exec("UPDATE metadata_tables SET logical_name='변경된 고객' WHERE table_name='CUSTOMER';");
    assert.equal(store.read({search:'변경된 고객'}).tables[0].logical,'변경된 고객');
    assert.throws(()=>store.read({schema:'x'.repeat(129)}),/128/);
  }finally{other?.close();db.close();rmSync(dir,{recursive:true,force:true});}
});

test('schema rejects missing parents, duplicate names/ordinals, invalid flags and nullable PKs',()=>{
  const db=new DatabaseSync(':memory:');try{
    new MetadataStore(db);db.exec(example);
    assert.throws(()=>db.exec("INSERT INTO metadata_tables VALUES('app','customer','duplicate')"));
    assert.throws(()=>db.exec("INSERT INTO metadata_columns(schema_name,table_name,ordinal_position,column_name,data_type) VALUES('APP','MISSING',1,'ID','INT')"));
    for(const patch of ['ordinal_position=2','ordinal_position=0','is_pk=2','is_pk=1,is_nullable=1',"column_name='customer_name'",'is_identity=1,is_nullable=1'])
      assert.throws(()=>db.exec(`UPDATE metadata_columns SET ${patch} WHERE table_name='CUSTOMER' AND column_name='CUSTOMER_ID'`));
    db.exec("DELETE FROM metadata_tables WHERE table_name='CUSTOMER'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM metadata_columns WHERE table_name='CUSTOMER'").get().n,0);
  }finally{db.close();}
});

test('empty-column tables are invalid and schema conflicts remain distinct',()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new MetadataStore(db);db.exec(example);
    db.exec("INSERT INTO metadata_tables VALUES('OTHER','CUSTOMER','빈 고객');");
    const a=store.read();assert.equal(a.tables.length,3);assert.equal(a.tables[2].valid,false);
    assert.match(a.diagnostics[0].message,/컬럼/);
    assert.equal(planDb2Import(blank(),a,choices(a)).added,2);
  }finally{db.close();}
});

test('query limits fail explicitly and rollback leaves catalog usable',()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new MetadataStore(db);const insert=db.prepare('INSERT INTO metadata_tables VALUES(?,?,?)');
    for(let i=0;i<501;i++)insert.run('APP','T'+i,'');
    assert.throws(()=>store.read(),/500/);assert.equal(store.read({search:'T500'}).tables.length,1);
  }finally{db.close();}
});
