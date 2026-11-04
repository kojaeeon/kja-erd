import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDb2Ddl,planDb2Import} from '../src/db2-import.js';
import {blank,demo,sql,validate} from '../src/model.js';
import {generateTestData,favoriteSql} from '../src/table-sql.js';
import {generateSqlXml} from '../src/sql-xml.js';
const choices=a=>Object.fromEntries(a.tables.map(t=>[t.key,{selected:t.valid,mode:'skip',rename:t.name+'_copy'}]));
const source=`SET CURRENT SCHEMA APP;
CREATE TABLE CUSTOMER (ID BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 10 INCREMENT BY 2) NOT NULL, NAME VARCHAR(100) NOT NULL, PRIMARY KEY(ID));
CREATE TABLE ORDERS (ID BIGINT PRIMARY KEY, CUSTOMER_ID BIGINT NOT NULL, AMOUNT DECIMAL(15,2) DEFAULT 0, MEMO VARCHAR(200) DEFAULT 'O''Reilly; a,b', CREATED_AT TIMESTAMP WITH DEFAULT CURRENT TIMESTAMP);
ALTER TABLE ORDERS ADD CONSTRAINT FK_ORDER_CUSTOMER FOREIGN KEY(CUSTOMER_ID) REFERENCES CUSTOMER(ID) ON DELETE CASCADE;
COMMENT ON TABLE CUSTOMER IS '고객';
COMMENT ON COLUMN CUSTOMER.NAME IS '고객명';
CREATE INDEX APP.IX_ORDER_CUSTOMER ON ORDERS(CUSTOMER_ID);`;
test('DB2 reads statements, comments, precision, defaults, schema, identity, ALTER FK and index without executing SQL',()=>{
  const a=parseDb2Ddl(source);assert.equal(a.tables.length,2);assert.equal(a.diagnostics.length,0);const [p,c]=a.tables;
  assert.equal(p.schema,'APP');assert.equal(p.logical,'고객');assert.equal(p.columns[1].logical,'고객명');assert.equal(p.columns[0].identityMode,'ALWAYS');assert.equal(p.columns[0].identityOptions,'START WITH 10 INCREMENT BY 2');
  assert.equal(c.columns[2].type,'DECIMAL(15,2)');assert.equal(c.columns[3].default,"'O''Reilly; a,b'");assert.equal(c.columns[4].default,'CURRENT TIMESTAMP');assert.equal(c.foreignKeys[0].onDelete,'CASCADE');assert.equal(c.indexes[0].columns[0],'CUSTOMER_ID');
});
test('DB2 import is atomic, preserves schemas and produces qualified DDL, test inserts and MyBatis',()=>{
  const a=parseDb2Ddl(source),d=blank(),before=structuredClone(d),plan=planDb2Import(d,a,choices(a));assert.deepEqual(d,before);validate(plan.document);
  assert.equal(plan.added,2);assert.equal(plan.document.relations.length,1);const [p,c]=plan.document.tables;assert.ok(c.position.x>p.position.x);
  const out=sql(plan.document);assert.deepEqual(out.errors,[]);assert.match(out.text,/CREATE TABLE "APP"\."CUSTOMER"/);assert.match(out.text,/GENERATED ALWAYS AS IDENTITY \(START WITH 10 INCREMENT BY 2\)/);assert.match(out.text,/REFERENCES "APP"\."CUSTOMER"/);
  assert.match(generateTestData(plan.document,p.id,{count:1}).text,/INSERT INTO "APP"\."CUSTOMER"/);assert.match(favoriteSql(plan.document,p.id)[0].text,/"APP"\."CUSTOMER_backup"/);assert.match(generateSqlXml(plan.document,p.id).text,/FROM "APP"\."CUSTOMER"/);
  const roundtrip=parseDb2Ddl(out.text);assert.equal(roundtrip.tables.length,2);assert.ok(roundtrip.tables.every(t=>t.valid));assert.equal(roundtrip.tables[1].foreignKeys.length,1);
});
test('single table selection resolves references to existing tables and supports conflict skip/update/rename',()=>{
  const a=parseDb2Ddl(source),d=planDb2Import(blank(),a,choices(a)).document,[p,c]=a.tables;
  const skip=planDb2Import(d,a,choices(a));assert.equal(skip.added,0);assert.equal(skip.updated,0);
  const selection=choices(a);selection[p.key].selected=false;selection[c.key].mode='rename';selection[c.key].rename='ORDERS_COPY';
  const copy=planDb2Import(d,a,selection);assert.equal(copy.added,1);assert.equal(copy.document.relations.length,2);
  const table=d.tables[0],id=table.columns[0].id,pos=structuredClone(table.position);table.columns.push({...table.columns[1],id:'old-column',name:'OLD_NAME'});
  const update=choices(a);update[c.key].selected=false;update[p.key].mode='update';const kept=planDb2Import(d,a,update);assert.equal(kept.document.tables[0].columns[0].id,id);assert.deepEqual(kept.document.tables[0].position,pos);assert.equal(kept.document.tables[0].columns.length,3);
  const removed=planDb2Import(d,a,update,{removeMissing:true});assert.equal(removed.document.tables[0].columns.length,2);assert.ok(removed.changes[0].columns.some(c=>c.action==='삭제'));
});
test('reader honors quoted identifiers and escaped comments and reports unsupported or invalid DDL',()=>{
  const a=parseDb2Ddl(`/* a /* nested */ b */ CREATE TABLE "Mixed"."T.A" ("X,Y" VARCHAR(20) DEFAULT 'a;--b', "ID" INT); COMMENT ON COLUMN "Mixed"."T.A"."X,Y" IS 'a''b'; DELETE FROM foo;`);
  assert.equal(a.tables[0].name,'T.A');assert.equal(a.tables[0].columns[0].name,'X,Y');assert.equal(a.tables[0].columns[0].logical,"a'b");assert.equal(a.diagnostics[0].level,'warning');
  const broken=parseDb2Ddl('CREATE TABLE BAD(ID INT, ID VARCHAR(1)); CREATE TABLE OK(ID INT);');assert.equal(broken.tables[0].valid,false);assert.equal(broken.tables[1].valid,true);assert.equal(broken.diagnostics[0].line,1);
  assert.throws(()=>parseDb2Ddl("CREATE TABLE T(ID INT DEFAULT 'bad);"),/따옴표/);
  const composite=parseDb2Ddl('CREATE TABLE T(A INT, B INT, FOREIGN KEY(A,B) REFERENCES P(A,B));');assert.match(composite.diagnostics[0].message,/복합 FK/);
});
test('schema omission detects collisions; matching dictionary links preserve SQL logical names',()=>{
  const a=parseDb2Ddl('CREATE TABLE A.T(ID INT); CREATE TABLE B.T(ID INT);');assert.throws(()=>planDb2Import(blank(),a,choices(a),{schemaMode:'omit'}),/중복|존재/);assert.equal(planDb2Import(blank(),a,choices(a)).added,2);
  const d=demo(),out=sql(d).text,b=parseDb2Ddl(out),plan=planDb2Import(blank(),b,choices(b));assert.equal(plan.added,4);
  const only=parseDb2Ddl('CREATE TABLE T("post_id" INTEGER);');const linked=planDb2Import({...d,tables:[],relations:[]},only,choices(only));assert.equal(linked.document.tables[0].columns[0].termId,d.terms[0].id);
});
test('unsupported ALTER is rolled back instead of leaking a partially imported column',()=>{
  const a=parseDb2Ddl('CREATE TABLE T(ID INT); ALTER TABLE T ADD COLUMN CALC INT GENERATED ALWAYS AS (ID + 1);');
  assert.equal(a.tables[0].columns.length,1);assert.match(a.diagnostics[0].message,/GENERATED/);
});
test('deleting a column removes its whole composite index and preserves SQL comments over dictionary linking',()=>{
  const a=parseDb2Ddl('CREATE TABLE T(ID INT, KEEP INT, OLD INT); CREATE UNIQUE INDEX IX ON T(KEEP,OLD);'),d=planDb2Import(blank(),a,choices(a)).document;
  const b=parseDb2Ddl('CREATE TABLE T(ID INT, KEEP INT);'),selection=choices(b);selection[b.tables[0].key].mode='update';const plan=planDb2Import(d,b,selection,{removeMissing:true});assert.equal(plan.document.tables[0].indexes.length,0);assert.match(plan.warnings[0],/인덱스/);
  const dict=demo(),c=parseDb2Ddl(`CREATE TABLE T("post_id" INTEGER); COMMENT ON COLUMN T."post_id" IS '다른 논리명';`),linked=planDb2Import({...dict,tables:[],relations:[]},c,choices(c));assert.equal(linked.document.tables[0].columns[0].logical,'다른 논리명');assert.equal(linked.document.tables[0].columns[0].termId,'');
});
