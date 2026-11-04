import test from 'node:test';
import assert from 'node:assert/strict';
import {demo,moveColumn,columnIsInDictionary,sql} from '../src/model.js';
test('column order changes preserve identities, relationships, dictionaries and indexes',()=>{
  const d=demo(),t=d.tables[1],first=t.columns[0],second=t.columns[1];
  t.indexes.push({id:'index',name:'ix_author',columns:[second.id],unique:false});
  const relations=structuredClone(d.relations),indexes=structuredClone(t.indexes),terms=structuredClone(d.terms);
  assert.equal(moveColumn(t,second.id,-1),true);assert.equal(t.columns[0].id,second.id);assert.equal(t.columns[1].id,first.id);assert.equal(t.columns[1].termId,first.termId);
  assert.deepEqual(d.relations,relations);assert.deepEqual(t.indexes,indexes);assert.deepEqual(d.terms,terms);
  const output=sql(d).text;assert.ok(output.indexOf('"author_id" INTEGER',output.indexOf('CREATE TABLE "blog_post"'))<output.indexOf('"post_id" INTEGER',output.indexOf('CREATE TABLE "blog_post"')));
  assert.equal(moveColumn(t,second.id,-1),false);assert.equal(moveColumn(t,t.columns.at(-1).id,1),false);assert.equal(moveColumn(t,'missing',1),false);
  assert.equal(moveColumn(t,second.id,1),true);assert.equal(t.columns[0].id,first.id);
});
test('dictionary outlines detect missing terms while recognizing linked and matching physical names',()=>{
  const terms=[{id:'term',physical:'POST_ID'}];
  assert.equal(columnIsInDictionary({termId:'term',name:'changed'},terms),true);
  assert.equal(columnIsInDictionary({name:' post_id '},terms),true);
  assert.equal(columnIsInDictionary({termId:'deleted',name:'other'},terms),false);
  assert.equal(columnIsInDictionary({name:''},terms),false);
});
