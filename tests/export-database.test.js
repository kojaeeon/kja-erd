import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {demo,sql,blank,importSqlTables} from '../src/model.js';
import {definitionHeaders,definitionRows,definitionClipboard} from '../src/definition-rows.js';
import {exportExcel} from '../src/excel-export.mjs';
import {createDatabase} from '../src/create-database.mjs';
test('Excel exports all table and column definitions as flat rows on one sheet without mutation',async()=>{
  const d=demo('sqlite'),t=d.tables[1];t.description='테이블 설명';t.indexes.push({id:'ix',name:'ix_title',unique:false,columns:[t.columns[2].id]});
  const before=structuredClone(d),wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportExcel(d));
  assert.equal(wb.worksheets.length,1);const sheet=wb.getWorksheet('테이블 정의서');
  assert.deepEqual(sheet.getRow(1).values.slice(1),definitionHeaders);
  assert.equal(sheet.rowCount,1+d.tables.reduce((n,t)=>n+t.columns.length,0));
  const rows=definitionRows(d),post=rows.filter(r=>r[1]===t.name);
  assert.ok(post.every(r=>r[3]==='테이블 설명'&&r[5]==='ix_title (post_title)'));
  const fk=post.find(r=>r[8]==='author_id');assert.equal(fk[13],'Y');assert.equal(fk[18],'blog_author.author_id');
  assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.autoFilter,'A1:S13');assert.deepEqual(d,before);
});

test('single table Excel retains external references and literal identifiers',async()=>{
  const d=demo('sqlite'),t=d.tables[1];t.name='x/y:*?[]';t.columns[2].name='=1+1';
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportExcel(d,{tableId:t.id}));
  const sheet=wb.worksheets[0];assert.equal(wb.worksheets.length,1);assert.equal(sheet.rowCount,t.columns.length+1);
  assert.equal(sheet.getCell('B2').value,'x/y:*?[]');assert.equal(sheet.getCell('I4').value,'=1+1');assert.equal(sheet.getCell('I4').type,ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('S3').value,'blog_author.author_id');
  await assert.rejects(exportExcel(d,{tableId:'missing'}),/테이블/);
});

test('clipboard preserves cell boundaries, protects literal text and includes scoped definitions',()=>{
  const d=demo('sqlite'),t=d.tables[1];t.description='첫 줄\n둘째\t"설명"';t.columns[2].name='=1+1';
  const text=definitionClipboard(d,t.id);assert.ok(text.startsWith(definitionHeaders.join('\t')+'\r\n'));
  assert.ok(text.includes('"첫 줄\n둘째\t""설명"""'));assert.ok(text.includes("'=1+1"));
  assert.ok(!text.includes('blog_author\t'));assert.ok(text.includes('blog_author.author_id'));
  t.columns=[];assert.equal(definitionRows(d,t.id).length,1);assert.equal(definitionRows(d,t.id)[0].length,definitionHeaders.length);
  assert.equal(definitionRows({...d,tables:[]}).length,0);
});

test('generated SQLite file contains tables, indexes and working FK constraints',()=>{
  const dir=mkdtempSync(join(tmpdir(),'erd-db-'));try{const d=demo('sqlite');d.tables[0].indexes.push({id:'ix',name:'ix_author_name',unique:true,columns:[d.tables[0].columns[1].id]});const result=createDatabase(sql(d).text,dir);assert.equal(result.tables.length,4);
  const db=new DatabaseSync(result.path);db.exec('PRAGMA foreign_keys=ON');assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_author_name'").get().name,'ix_author_name');assert.throws(()=>db.exec('INSERT INTO blog_post(author_id) VALUES(100)'));db.close();
  const again=createDatabase(sql(d).text,dir);assert.notEqual(again.id,result.id);
  const imported=importSqlTables(blank(),result.tables);assert.equal(imported.tables.length,4);assert.equal(imported.relations.length,3);assert.equal(imported.tables.find(t=>t.name==='blog_author').columns[0].ai,true);
  assert.ok(imported.tables.find(t=>t.name==='blog_author').indexes.some(ix=>ix.name==='ix_author_name'&&ix.unique));
  const roundtrip={...blank(),dialect:'sqlite',...imported};assert.deepEqual(sql(roundtrip).errors,[]);const testDb=new DatabaseSync(':memory:');testDb.exec(sql(roundtrip).text);testDb.close();assert.throws(()=>importSqlTables(d,result.tables),/이미 존재/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('SQL failure is atomic and SQL cannot attach files or write data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'erd-db-'));try{
    for(const script of ['CREATE TABLE x(id INTEGER); CREATE TABLE x(id INTEGER);',"ATTACH DATABASE ':memory:' AS other;",'CREATE TABLE x(id INTEGER); INSERT INTO x VALUES(1);','CREATE TABLE x(id INTEGER); DROP TABLE x;','CREATE TABLE x AS SELECT 1;'])assert.throws(()=>createDatabase(script,dir));
    assert.deepEqual(readdirSync(dir),[]);
    assert.throws(()=>createDatabase('CREATE TABLE child(id INTEGER REFERENCES missing(id));',dir));assert.deepEqual(readdirSync(dir),[]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
