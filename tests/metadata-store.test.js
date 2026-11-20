import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MetadataStore} from '../src/metadata-store.mjs';
import {planDb2Import} from '../src/db2-import.js';
import {blank,demo,validate} from '../src/model.js';
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

test('ERD table registration and catalog edits preserve properties and import the edited column order', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new MetadataStore(db);
    const project = demo();
    const table = {...project.tables[0], schema: 'APP'};
    const before = structuredClone(project);
    assert.deepEqual(store.write(table), {schema: 'APP', name: table.name});
    const [registered] = store.read({schema: 'app'}).tables;
    assert.equal(registered.columns[0].pk, true);
    assert.equal(registered.columns[0].ai, true);
    assert.equal(registered.columns[0].nullable, false);

    const edited = {
      ...registered,
      schema: '',
      name: 'AUTHOR_ARCHIVE',
      logical: '저자 아카이브',
      columns: [
        {...registered.columns[2], name: 'EMAIL_ADDRESS', type: 'VARCHAR(320)', unique: true, default: "'unknown'"},
        {...registered.columns[0], identityMode: 'ALWAYS'},
      ],
    };
    store.write(edited, {schema: 'app', name: table.name.toUpperCase()});
    const analysis = store.read();
    assert.equal(analysis.tables.length, 1);
    const [saved] = analysis.tables;
    assert.deepEqual(saved.columns.map(c => c.name), ['EMAIL_ADDRESS', table.columns[0].name]);
    assert.equal(saved.columns[0].type, 'VARCHAR(320)');
    assert.equal(saved.columns[0].unique, true);
    assert.equal(saved.columns[0].default, "'unknown'");
    assert.equal(saved.columns[1].identityMode, 'ALWAYS');
    assert.equal(saved.logical, edited.logical);
    const imported = planDb2Import(blank(), analysis, choices(analysis));
    assert.equal(imported.added, 1);
    assert.equal(imported.document.tables[0].name, edited.name);
    assert.deepEqual(project, before);
    assert.deepEqual(store.remove({name: 'author_archive'}), {deleted: true});
    assert.deepEqual(store.read().tables, []);
    assert.equal(db.prepare('SELECT count(*) AS count FROM metadata_columns').get().count, 0);
  } finally {
    db.close();
  }
});

test('catalog rejects duplicate keys, duplicate column names and rolls back partial edits on failure', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const store = new MetadataStore(db);
    db.exec(example);
    const before = store.read();
    const [customer, other] = before.tables;
    const key = {schema: customer.schema, name: customer.name};
    assert.throws(() => store.write({...customer, name: customer.name.toLowerCase()}), {status: 409});
    assert.throws(() => store.write({...customer, name: other.name}, key), {status: 409});
    assert.throws(() => store.write({
      ...customer, columns: [customer.columns[0], {...customer.columns[0], name: customer.columns[0].name.toLowerCase()}],
    }, key), /중복 컬럼명/);
    assert.throws(() => store.write(customer, {name: 'MISSING'}), {status: 404});
    assert.throws(() => store.remove({name: 'MISSING'}), {status: 404});
    db.exec(`CREATE TRIGGER reject_test_column BEFORE INSERT ON metadata_columns
      WHEN new.column_name = 'REJECTED' BEGIN SELECT RAISE(ABORT, 'test write failure'); END;`);
    assert.throws(() => store.write({
      ...customer, name: 'RENAMED', columns: [customer.columns[0], {...customer.columns[1], name: 'REJECTED'}],
    }, key), /test write failure/);
    assert.deepEqual(store.read(), before);
  } finally {
    db.close();
  }
});
