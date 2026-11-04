import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {demo,sql,blank,importSqlTables} from '../src/model.js';
import {exportExcel} from '../src/excel-export.mjs';
import {createDatabase} from '../src/create-database.mjs';
test('Excel export matches reference sheets, keys, rows and dictionary precision',async()=>{
  const d=demo('sqlite');d.types.push({id:'money',name:'금액',type:'DECIMAL',length:'12',scale:'2'});d.terms.push({id:'amount',logical:'결제 금액',physical:'amount',typeId:'money',length:'15',scale:'0'});
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportExcel(d));
  assert.equal(wb.worksheets.length,10);assert.equal(wb.worksheets[0].name,'All Table List');
  assert.equal(wb.getWorksheet('All Column List').rowCount,13);assert.equal(wb.getWorksheet('blog_post').getCell('K10').value,'blog_author');
  assert.equal(wb.getWorksheet('Name Dictionary List').getCell('D4').value,'DECIMAL(15,0)');assert.equal(wb.getWorksheet('Name Dictionary List').getCell('G4').value,0);
  assert.equal(wb.getWorksheet('blog_author').getCell('B9').value,'Y');assert.equal(wb.getWorksheet('blog_author').views[0].ySplit,8);
});
test('Excel worksheet names are valid, unique and identifiers remain literal',async()=>{
  const d=demo('sqlite');d.tables[0].name='All Table List';d.tables[1].name='x/y:*?[]';d.tables[0].columns[0].name='=1+1';
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(await exportExcel(d));assert.ok(wb.getWorksheet('All Table List (2)'));assert.ok(wb.getWorksheet('x_y_____'));
  assert.equal(wb.getWorksheet('All Column List').getCell('I2').value,'=1+1');
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
