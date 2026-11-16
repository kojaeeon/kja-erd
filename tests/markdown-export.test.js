import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';
import {generateMarkdown,markdownCell} from '../src/markdown-export.js';

test('Markdown export respects selected fields, scope, PK nullability and external FK references without mutation',()=>{
  const doc=demo(),child=doc.tables[1],relation=doc.relations.find(r=>r.target===child.id);
  const parent=doc.tables.find(t=>t.id===relation.source),column=parent.columns.find(c=>c.id===relation.sourceColumn);
  child.columns[0].name='CUSTOMER_ID';child.columns[0].pk=true;child.columns[0].nullable=true;
  const before=structuredClone(doc),r=generateMarkdown(doc,{tableId:child.id,fields:['name','camel','nullable','references']});
  assert.equal(r.sections.length,1);assert.deepEqual(r.fields.map(f=>f.id),['name','camel','nullable','references']);
  assert.match(r.text,/\| 컬럼명 \| 카멜케이스 \| NULL 허용 \| 참조 컬럼 \|/);
  assert.ok(r.text.includes(markdownCell('CUSTOMER_ID')+' | customerId | N'));
  assert.ok(r.text.includes(markdownCell([parent.schema,parent.name,column.name].filter(Boolean).join('.'))));
  assert.doesNotMatch(r.text,/\| TYPE \|/);assert.deepEqual(doc,before);
  assert.equal(generateMarkdown(doc).sections.length,doc.tables.length);
});
test('Markdown keeps pipes, multiline content, markup and SQL defaults inside table cells',()=>{
  assert.equal(markdownCell('a|b\r\n<script>&_*`\\'), 'a&#124;b<br>&lt;script&gt;&amp;\\_\\*\\`\\\\');
  const doc=demo(),table=doc.tables[0];table.name='BAD/FILE';table.description='A\n# injected';
  table.columns[0].description='x|y\n<img src=x>';table.columns[0].default=0;
  const r=generateMarkdown(doc,{tableId:table.id,fields:['default','description']});
  assert.equal(r.fileName,'BAD_FILE.md');assert.match(r.text,/\| 0 \| x&#124;y<br>&lt;img src=x&gt; \|/);
  assert.ok(r.text.includes('A<br>\\# injected'));
  const lines=r.text.split('\n').filter(line=>line.startsWith('|'));
  assert.ok(lines.every(line=>line.split('|').length===4));
});
test('Markdown rejects empty output and missing tables, supports empty tables and persists project options',()=>{
  const doc=demo();assert.throws(()=>generateMarkdown(doc,{fields:[]}),/출력 항목/);
  assert.throws(()=>generateMarkdown(doc,{tableId:'missing'}),/테이블/);
  assert.throws(()=>generateMarkdown({...doc,tables:[]}),/테이블/);
  doc.tables[0].columns=[];assert.equal(generateMarkdown(doc,{tableId:doc.tables[0].id}).sections[0].rows.length,0);
  const saved=demo();saved.exportOptions={headerColor:'#2563eb',markdownFields:['name','camel']};
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.save(saved.id,saved);assert.deepEqual(store.get(saved.id).exportOptions,saved.exportOptions);}finally{db.close();}
});
