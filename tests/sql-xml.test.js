import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo,sql} from '../src/model.js';
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

test('query XML omits resultMap and includes, and aliases SELECT columns to the chosen VO properties',()=>{
  const d=demo('sqlite'),t=d.tables[0],r=generateSqlXml(d,t.id,{format:'queries'});
  assert.doesNotMatch(r.text,/<resultMap|resultMap=|<include|<sql /);
  assert.match(r.text,/resultType="com.example.vo.BlogAuthorVO"/);
  assert.match(r.text,/"author_id" AS "authorId", \/\* 저자 아이디 \*\//);
  assert.match(r.text,/FROM "blog_author" \/\* 저자 \*\//);
  const query=r.text.match(/<select id="selectById"[^>]*>([\s\S]*?)<\/select>/)[1].replace(/#\{(\w+)(?:,[^}]+)?\}/g,':$1');
  const db=new DatabaseSync(':memory:');try{db.exec(sql(d).text);db.exec("INSERT INTO blog_author(display_name) VALUES ('tester')");const row=db.prepare(query).get({authorId:1});assert.equal(row.authorId,1);assert.equal(row.displayName,'tester');}finally{db.close();}
});

test('pure SQL uses named bindings and executable CRUD without XML or Mapper validation',()=>{
  const d=demo('sqlite'),t=d.tables[0],before=structuredClone(d);
  const r=generateSqlXml(d,t.id,{format:'sql',namespace:'invalid namespace',voType:'invalid type',keyMode:'db2'});
  assert.equal(r.fileName,'BlogAuthor.sql');assert.equal(r.mimeType,'text/plain;charset=utf-8');
  assert.doesNotMatch(r.text,/<mapper|<select|<if|resultMap|resultType|#\{|&quot;|&amp;/);
  assert.match(r.text,/:authorId/);assert.match(r.text,/"display_name", \/\* 표시 이름 \*\//);
  const statements=r.text.split(';').map(s=>s.trim()).filter(Boolean);assert.equal(statements.length,5);
  const db=new DatabaseSync(':memory:');try{
    db.exec(sql(d).text);db.prepare(statements[2]).run({displayName:'before',email:'test@example.com'});
    assert.equal(db.prepare(statements[0]).get({authorId:1}).display_name,'before');assert.equal(db.prepare(statements[1]).all().length,1);
    db.prepare(statements[3]).run({authorId:1,displayName:'after',email:null});assert.equal(db.prepare(statements[0]).get({authorId:1}).display_name,'after');
    db.prepare(statements[4]).run({authorId:1});assert.equal(db.prepare(statements[1]).all().length,0);
  }finally{db.close();}
  assert.deepEqual(d,before);
});

test('SELECT logical comments are optional and escape SQL delimiters and XML content in every format',()=>{
  for(const format of ['mapper','queries','sql'])for(const dialect of ['db2','sqlite','mysql','postgres']){
    const d=demo(dialect),t=d.tables[0];t.logical='테이블 <& */ /* 주석';t.columns[0].logical='컬럼 <& */ /* 주석\n다음 줄';
    const r=generateSqlXml(d,t.id,{format,comments:false,insert:false,update:false,delete:false});
    const logical=format==='sql'?'컬럼 <&':'컬럼 &lt;&amp;';assert.ok(r.text.includes('/* '+logical+' * / / * 주석 다음 줄 */'));
    if(format!=='sql')assert.doesNotMatch(r.text,/<&/);
    const disabled=generateSqlXml(d,t.id,{format,comments:false,selectComments:false,insert:false,update:false,delete:false});assert.ok(!disabled.text.includes('/* 컬럼'));assert.ok(!disabled.text.includes('/* 테이블'));
  }
});
