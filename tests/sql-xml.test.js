import test from 'node:test';
import assert from 'node:assert/strict';
import {demo} from '../src/model.js';
import {generateSqlXml,jdbcType} from '../src/sql-xml.js';
test('MyBatis uses matching VO properties, typed bindings and safe DB2 keys',()=>{
  const d=demo(),t=d.tables[1],before=structuredClone(d),r=generateSqlXml(d,t.id,{keyMode:'db2'});
  assert.match(r.text,/property="postId"/);assert.match(r.text,/#\{postId,jdbcType=INTEGER\}/);assert.match(r.text,/keyProperty="postId" resultType="java.lang.Integer" order="AFTER"/);assert.match(r.text,/VALUES IDENTITY_VAL_LOCAL/);
  const insert=r.text.match(/INSERT INTO[^\n]+/)[0];assert.doesNotMatch(insert,/post_id/);assert.match(r.text,/<choose>/);assert.match(r.text,/AND 1 = 0<\/if>/);assert.match(r.text,/WHERE "post_id" = #\{postId/);assert.doesNotMatch(r.text,/\$\{/);assert.doesNotMatch(r.text,/&quot;/);assert.deepEqual(d,before);
  assert.equal(jdbcType('DECIMAL(31,8)'),'DECIMAL');assert.equal(jdbcType('DATETIME'),'TIMESTAMP');assert.equal(jdbcType('TEXT'),'CLOB');
});
test('MyBatis composite keys, keyless guards and generation switches',()=>{
  const d=demo(),t=d.tables[3];const r=generateSqlXml(d,t.id,{updateNulls:true});assert.match(r.text,/post_id" = #\{postId,jdbcType=INTEGER\} AND "category_id/);
  t.columns.forEach(c=>c.pk=false);const guarded=generateSqlXml(d,t.id);assert.match(guarded.text,/WHERE 1 = 0/);assert.ok(guarded.warnings.length);
  const selectOnly=generateSqlXml(d,t.id,{insert:false,update:false,delete:false});assert.doesNotMatch(selectOnly.text,/<insert |<update |<delete /);
  assert.throws(()=>generateSqlXml(d,t.id,{namespace:'bad"/>'}),/네임스페이스/);assert.throws(()=>generateSqlXml(d,t.id,{keyMode:'db2'}),/자동생성/);
});
test('MyBatis XML escapes identifiers and supports static NULL writes and JDBC key options',()=>{
  const d=demo(),t=d.tables[1];t.name='a<&"';t.logical='x -- y';t.columns[1].name='A&B';
  const r=generateSqlXml(d,t.id,{style:'upper',updateNulls:true,keyMode:'jdbc'});assert.match(r.text,/column="A&amp;B"/);assert.match(r.text,/a&lt;&amp;/);assert.match(r.text,/useGeneratedKeys="true"/);assert.match(r.text,/keyProperty="POST_ID"/);assert.doesNotMatch(r.text,/<choose>/);assert.match(r.text,/x - - y/);
  assert.throws(()=>generateSqlXml(d,t.id,{keyMode:'jdbc',skipIdentity:false}),/자동생성/);
});

test('XML attribute quotes remain escaped while SQL body quotes stay literal',()=>{
  const d=demo(),t=d.tables[1];t.columns[1].name='AUTHOR"ID';
  const r=generateSqlXml(d,t.id);
  assert.match(r.text,/column="AUTHOR&quot;ID"/);
  assert.match(r.text,/"AUTHOR""ID"/);
});
