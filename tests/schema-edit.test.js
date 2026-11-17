import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo,changeTableSchema,sql} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';
import {definitionRows} from '../src/definition-rows.js';
import {generateMarkdown} from '../src/markdown-export.js';

test('changing schema updates SQL, FK references, definition exports and saved project',()=>{
  const doc=demo(),parent=doc.tables.find(t=>t.id===doc.relations[0].source);
  const before=structuredClone(doc.relations);
  changeTableSchema(doc,parent.id,'  BANK  ');
  assert.equal(parent.schema,'BANK');
  assert.deepEqual(doc.relations,before);
  assert.match(sql(doc).text,new RegExp(`"BANK"\\."${parent.name}"`));
  assert.match(sql(doc).text,new RegExp(`REFERENCES "BANK"\\."${parent.name}"`));
  assert.ok(definitionRows(doc,parent.id).every(row=>row[0]==='BANK'));
  assert.match(generateMarkdown(doc,{tableId:parent.id}).sections[0].heading,/^BANK\./);
  const db=new DatabaseSync(':memory:');
  try{const store=new ProjectStore(db);store.save(doc.id,doc);assert.equal(store.get(doc.id).tables.find(t=>t.id===parent.id).schema,'BANK');}finally{db.close();}
  changeTableSchema(doc,parent.id,'');
  assert.equal(definitionRows(doc,parent.id)[0][0],'');
  assert.ok(!generateMarkdown(doc,{tableId:parent.id}).sections[0].heading.startsWith('BANK.'));
});
test('schema edits refuse collisions and invalid input without modifying the table',()=>{
  const doc=demo(),table=doc.tables[0];table.schema='OLD';
  doc.tables.push({...structuredClone(table),id:'other',schema:'NEW'});
  assert.throws(()=>changeTableSchema(doc,table.id,'new'),/같은 이름/);
  assert.throws(()=>changeTableSchema(doc,table.id,'x'.repeat(129)),/128/);
  assert.throws(()=>changeTableSchema(doc,table.id,'A\nB'),/제어문자/);
  assert.equal(table.schema,'OLD');
});
