import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo,blank,copyProject,tableView,validate,sql} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';

test('project copy remaps all references and preserves dictionaries, layout settings and SQL',()=>{
  const d=demo();d.tableView={ai:false,unique:true};d.notes.push({id:'note',text:'메모',position:{x:10,y:20}});
  d.tables[1].indexes.push({id:'index',name:'ix_title',unique:false,columns:[d.tables[1].columns[2].id]});
  const before=structuredClone(d),copy=copyProject(d);
  assert.notEqual(copy.id,d.id);assert.equal(copy.name,d.name+' (복사)');assert.deepEqual(validate(copy),copy);
  assert.notEqual(copy.tables[0].id,d.tables[0].id);assert.notEqual(copy.terms[0].id,d.terms[0].id);
  assert.equal(copy.tables[1].columns[0].termId,copy.terms[0].id);assert.equal(copy.terms[0].typeId,copy.types[0].id);
  assert.deepEqual(copy.terms[0].wordIds,[copy.words[1].id,copy.words[0].id]);
  assert.equal(copy.relations[0].source,copy.tables[0].id);assert.equal(copy.relations[0].targetColumn,copy.tables[1].columns[1].id);
  assert.equal(copy.tables[1].indexes[0].columns[0],copy.tables[1].columns[2].id);
  assert.notEqual(copy.notes[0].id,d.notes[0].id);assert.deepEqual(copy.tableView,d.tableView);
  assert.equal(sql(copy).text,sql(d).text);copy.tables[0].columns[0].name='changed';assert.deepEqual(d,before);
});
test('table visibility defaults support legacy projects and retain at least one name',()=>{
  const d=demo(),before=structuredClone(d);assert.equal(tableView(d).ai,true);assert.equal(tableView(d).default,false);
  d.tableView={logical:false,name:false,ai:false,unique:true};const settings=tableView(d);
  assert.equal(settings.name,true);assert.equal(settings.ai,false);assert.equal(settings.unique,true);
  assert.equal(sql(d).text,sql(before).text);assert.equal(d.tableView.name,false);
});
test('project store migrates existing database without changing designs or revision history',()=>{
  const db=new DatabaseSync(':memory:');try {
    db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,document TEXT NOT NULL,updated_at TEXT NOT NULL)');
    const d=demo();db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(d.id,d.name,JSON.stringify(d),'2026-10-08');
    const store=new ProjectStore(db);assert.deepEqual(store.get(d.id),d);assert.equal(store.list().length,1);
    store.save(d.id,d);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revisions').get().n,1);
  }finally{db.close();}
});
test('trash blocks autosave resurrection, preserves history and can be restored with independent copy',()=>{
  const db=new DatabaseSync(':memory:');try {
    const store=new ProjectStore(db),d=demo();store.save(d.id,d);const copied=store.copy(d.id);
    assert.equal(store.list().length,2);store.trash(d.id);assert.equal(store.list().length,1);assert.equal(store.list(true)[0].id,d.id);
    assert.throws(()=>store.get(d.id));assert.throws(()=>store.save(d.id,d),/휴지통/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revisions WHERE project_id=?').get(d.id).n,1);
    assert.equal(store.get(copied.id).name,copied.name);assert.deepEqual(store.restore(d.id),d);assert.equal(store.list(true).length,0);
    store.save(d.id,d);assert.equal(store.list().length,2);assert.throws(()=>store.restore('missing'));assert.throws(()=>store.trash('missing'));
    const invalid=blank();invalid.id=d.id;invalid.tables=null;assert.throws(()=>store.save(d.id,invalid));assert.deepEqual(store.get(d.id),d);
  }finally{db.close();}
});
