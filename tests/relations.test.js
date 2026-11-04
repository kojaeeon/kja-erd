import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo,relationConnection,relationIssue,buildRelation,copyProject,sql} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';

test('pointer connections resolve column handles and reject missing, duplicate and same-column endpoints',()=>{
  const d=demo(),parent=d.tables[0],child=d.tables[2],connection={source:parent.id,target:child.id,sourceHandle:'out-'+parent.columns[0].id,targetHandle:'in-'+child.columns[1].id};
  const value=relationConnection(d,connection);assert.equal(relationIssue(d,value),'');const relation=buildRelation(d,value);assert.equal(relation.cardinality,'1:N');assert.equal(relation.description,'');d.relations.push(relation);assert.match(relationIssue(d,value),/이미 연결/);
  assert.equal(relationIssue(d,{...value,id:relation.id},relation.id),'');assert.throws(()=>buildRelation(d,value),/이미 연결/);
  assert.match(relationIssue(d,relationConnection(d,{...connection,targetHandle:null})),/컬럼을 선택/);
  assert.match(relationIssue(d,{...value,target:parent.id,targetColumn:parent.columns[0].id}),/같은 컬럼/);
  assert.equal(relationIssue(d,{source:parent.id,target:parent.id,sourceColumn:parent.columns[0].id,targetColumn:parent.columns[1].id}), '');
});
test('relation descriptions survive saves and project copies without changing physical SQL',()=>{
  const d=demo(),db=new DatabaseSync(':memory:');try{
    const before=sql(d).text,r=d.relations[0];d.relations[0]=buildRelation(d,{...r,description:'  한 저자는 여러 게시글을 작성한다\n검토 <완료>  '});assert.equal(sql(d).text,before);
    const store=new ProjectStore(db);store.save(d.id,d);assert.equal(store.get(d.id).relations[0].description,'한 저자는 여러 게시글을 작성한다\n검토 <완료>');const copy=copyProject(d);assert.equal(copy.relations[0].description,d.relations[0].description);assert.notEqual(copy.relations[0].source,d.relations[0].source);
    assert.throws(()=>buildRelation(d,{...r,description:'x'.repeat(1001)}),/1000자/);
  }finally{db.close();}
});
