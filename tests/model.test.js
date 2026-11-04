import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { demo, sql, synchronize, validate, termType, dictionaryErrors, suggestTerms } from '../src/model.js';
test('demo SQLite SQL executes and foreign keys reject orphan rows',()=>{
  const d=demo('sqlite'); const generated=sql(d);assert.deepEqual(generated.errors,[]);
  const db=new DatabaseSync(':memory:');db.exec(generated.text);
  db.prepare('INSERT INTO blog_author(display_name) VALUES(?)').run('저자');
  db.prepare('INSERT INTO blog_post(author_id,post_title) VALUES(?,?)').run(1,'제목');
  assert.throws(()=>db.prepare('INSERT INTO blog_post(author_id) VALUES(?)').run(99));db.close();
});
test('word and type changes propagate to linked columns',()=>{
  const d=demo('sqlite');d.words[1].physical='article';d.types[0].type='BIGINT';synchronize(d);
  const c=d.tables[1].columns[0];assert.equal(c.name,'article_id');assert.equal(c.type,'BIGINT');
});
test('invalid autoincrement and duplicate names are reported',()=>{
  const d=demo('sqlite');d.tables[0].columns[0].type='TEXT';d.tables[1].name=d.tables[0].name;
  assert.ok(sql(d).errors.length>=2);
});
test('broken relation import is rejected',()=>{
  const d=demo('sqlite');d.relations[0].targetColumn='missing';assert.throws(()=>validate(d));
});
test('composite primary keys and indexes execute',()=>{
  const d=demo('sqlite');const t=d.tables[3];t.indexes.push({id:'test',name:'ix_category',unique:false,columns:[t.columns[1].id]});
  const db=new DatabaseSync(':memory:');db.exec(sql(d).text);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='ix_category'").get().n,1);db.close();
});
test('term size overrides type defaults and reaches SQLite DDL',()=>{
  const d=demo('sqlite');const term=d.terms[0];d.types[0].type='VARCHAR';d.types[0].length='45';
  assert.equal(termType(term,d.types),'VARCHAR(45)');term.length='100';
  d.tables[1].columns[0].ai=false;synchronize(d);assert.equal(d.tables[1].columns[0].type,'VARCHAR(100)');
  assert.match(sql(d).text,/"post_id" VARCHAR\(100\)/);
  const db=new DatabaseSync(':memory:');db.exec(sql(d).text);db.close();
});
test('decimal precision and scale defaults, overrides and invalid values',()=>{
  const d=demo('sqlite');const term=d.terms[0];d.types[0].type='DECIMAL(12,2)';
  assert.equal(termType(term,d.types),'DECIMAL(12,2)');term.length='15';term.scale='0';assert.equal(termType(term,d.types),'DECIMAL(15,0)');
  term.scale='16';assert.ok(dictionaryErrors(d).some(e=>e.includes('소수 자리수')));
  term.scale='2';term.length='-1';assert.ok(dictionaryErrors(d).some(e=>e.includes('자리수')));
  d.types[0].type='DECIMAL';term.length='';assert.ok(dictionaryErrors(d).some(e=>e.includes('전체 자리수')));
});
test('fixed types ignore stale sizes and dictionary duplicate names are rejected',()=>{
  const d=demo('sqlite');d.terms[0].length='100';assert.equal(termType(d.terms[0],d.types),'INTEGER');
  d.words.push({...d.words[0],id:'duplicate'});assert.ok(dictionaryErrors(d).some(e=>e.includes('중복')));
});
test('term suggestions use literal substring matching and prioritize exact and prefix matches',()=>{
  const terms=[{id:'middle',logical:'회원 이름',physical:'member_name'},{id:'prefix',logical:'이름 코드',physical:'name_code'},{id:'exact',logical:'이름',physical:'name'},{id:'literal',logical:'할인율%',physical:'discount_rate'}];
  assert.deepEqual(suggestTerms(terms,' 이름 ').map(t=>t.id),['exact','prefix','middle']);
  assert.deepEqual(suggestTerms(terms,'MEMBER').map(t=>t.id),['middle']);
  assert.deepEqual(suggestTerms(terms,'%').map(t=>t.id),['literal']);
  assert.deepEqual(suggestTerms(terms,'없는 용어'),[]);assert.deepEqual(suggestTerms(terms,'  '),[]);
  assert.equal(terms[0].id,'middle');
});
test('editing linked logical names preserves input while selecting a term restores dictionary sizes',()=>{
  const d=demo('sqlite'),c=d.tables[1].columns[0],term=d.terms[0];
  c.termId='';c.logical='직접 입력한 이름';synchronize(d);assert.equal(c.logical,'직접 입력한 이름');
  d.types[0].type='VARCHAR';term.length='120';c.termId=term.id;synchronize(d);
  assert.equal(c.logical,term.logical);assert.equal(c.name,term.physical);assert.equal(c.type,'VARCHAR(120)');
});
