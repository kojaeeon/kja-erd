import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {demo,sql,blank,newTable,column} from '../src/model.js';
import {generateTestData,favoriteSql,valueSql} from '../src/table-sql.js';
import {testDataTemplate,excelTestData} from '../src/data-excel.mjs';

test('test data respects row count, identity exclusion, fixed FK values and escaping without mutating design',()=>{
  const d=demo('sqlite'),table=d.tables[1],before=structuredClone(d);
  const result=generateTestData(d,table.id,{count:3,rules:{[table.columns[1].id]:{mode:'fixed',value:'1'},[table.columns[2].id]:{mode:'fixed',value:"O'Reilly"}}});
  assert.equal(result.rows.length,3);assert.equal(result.columns.some(c=>c.ai),false);assert.match(result.text,/O''Reilly/);assert.equal(result.warnings.length,1);
  const db=new DatabaseSync(':memory:');try{db.exec(sql(d).text);db.exec("INSERT INTO blog_author(display_name) VALUES ('author')");db.exec(result.text);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blog_post').get().n,3);assert.equal(db.prepare('SELECT post_title FROM blog_post').get().post_title,"O'Reilly");}finally{db.close();}
  assert.deepEqual(d,before);
});
test('DB2 samples generate typed dates and exact decimals and detect constraints and limits',()=>{
  const d=blank(),table=newTable();d.tables.push(table);table.columns.push(column('amount','금액','DECIMAL(31,2)'),column('created','생성일','TIMESTAMP'));
  const result=generateTestData(d,table.id,{count:2,start:100});assert.match(result.text,/1\.00/);assert.match(result.text,/TIMESTAMP\('2020-/);
  assert.throws(()=>generateTestData(d,table.id,{count:10001}));assert.throws(()=>generateTestData(d,table.id,{count:0}));
  table.columns[1].pk=true;assert.throws(()=>generateTestData(d,table.id,{count:2,includeIdentity:true,rules:{[table.columns[0].id]:{mode:'fixed',value:'1'},[table.columns[1].id]:{mode:'fixed',value:'1'}}}),/중복/);
  assert.equal(valueSql(table.columns[1],'12345678901234567890123456789.12','db2'),'12345678901234567890123456789.12');
  assert.throws(()=>valueSql(table.columns[1],'1.234','db2'),/자리수/);assert.throws(()=>valueSql(table.columns[1],'1); DROP TABLE x;','db2'),/숫자/);
  assert.throws(()=>valueSql(table.columns[2],'2020-02-30 12:00:00','db2'),/날짜/);
});
test('composite keys allow repeating individual key values but disallow repeated key groups',()=>{
  const d=demo('sqlite'),t=d.tables[3];const result=generateTestData(d,t.id,{count:3,rules:{[t.columns[0].id]:{mode:'fixed',value:'1'}}});assert.equal(result.rows.length,3);
  assert.throws(()=>generateTestData(d,t.id,{count:3,rules:{[t.columns[0].id]:{mode:'fixed',value:'1'},[t.columns[1].id]:{mode:'fixed',value:'1'}}}),/중복/);
});
test('SQLite default-only inserts and DEFAULT strategies execute correctly',()=>{
  const d=blank();d.dialect='sqlite';const t=newTable();d.tables.push(t);
  const db=new DatabaseSync(':memory:');try{db.exec(sql(d).text);db.exec(generateTestData(d,t.id,{count:2}).text);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM table_1').get().n,2);}finally{db.close();}
  const c=column('value','값','INTEGER');c.default='42';c.nullable=false;t.columns.push(c);
  const db2=new DatabaseSync(':memory:');try{db2.exec(sql(d).text);db2.exec(generateTestData(d,t.id,{count:1,rules:{[c.id]:{mode:'default'}}}).text);assert.equal(db2.prepare('SELECT value FROM table_1').get().value,42);}finally{db2.close();}
});
test('SQL examples cover DB2 backups, paging, relational joins, identity and MERGE',()=>{
  const d=demo(),t=d.tables[1],before=structuredClone(d),items=favoriteSql(d,t.id);
  assert.equal(items.length,8);assert.match(items.find(i=>i.id==='backup').text,/AS \(SELECT \* FROM "blog_post"\) WITH DATA/);
  assert.match(items.find(i=>i.id==='paging').text,/OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY/);
  assert.match(items.find(i=>i.id==='join').text,/INNER JOIN "blog_author"/);assert.match(items.find(i=>i.id==='join').text,/ROW_NUMBER\(\)/);
  assert.match(items.find(i=>i.id==='insert').text,/IDENTITY_VAL_LOCAL/);assert.match(items.find(i=>i.id==='upsert').text,/MERGE INTO "blog_post"/);
  assert.match(items.find(i=>i.id==='upsert').text,/WHEN MATCHED THEN UPDATE/);assert.match(items.find(i=>i.id==='upsert').text,/WHEN NOT MATCHED THEN INSERT/);
  assert.doesNotMatch(items.map(i=>i.text).join('\n'),/LIMIT |ON DUPLICATE/);assert.deepEqual(d,before);
});
test('SQLite SQL examples execute including backup, paging, joins, update and upsert',()=>{
  const d=demo('sqlite'),db=new DatabaseSync(':memory:');try{db.exec(sql(d).text);db.exec("INSERT INTO blog_author(display_name) VALUES ('author')");
    for(const item of favoriteSql(d,d.tables[1].id))assert.doesNotThrow(()=>db.exec(item.text),item.title);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM blog_post').get().n,1);
  }finally{db.close();}
});
test('keyless tables get guarded mutation examples and composite MERGE matches every key',()=>{
  const d=demo();assert.match(favoriteSql(d,d.tables[3].id).find(i=>i.id==='upsert').text,/t\."post_id" = s\."post_id" AND t\."category_id" = s\."category_id"/);
  d.tables[0].columns[0].pk=false;const items=favoriteSql(d,d.tables[0].id);assert.match(items.find(i=>i.id==='update').text,/WHERE 1 = 0/);assert.match(items.find(i=>i.id==='upsert').text,/PK가 없습니다/);
});
test('Excel sample template roundtrips data and rejects formulas, invalid types and missing required columns',async()=>{
  const d=demo('sqlite'),t=d.tables[0],buffer=await testDataTemplate(d,t.id),wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
  const sheet=wb.getWorksheet('Test Data');assert.equal(sheet.getCell('A1').value,'display_name');assert.equal(sheet.views[0].ySplit,3);
  sheet.getCell('A4').value="O'Reilly";sheet.getCell('B4').value='[NULL]';
  const result=await excelTestData(d,t.id,Buffer.from(await wb.xlsx.writeBuffer()));assert.equal(result.count,1);assert.match(result.text,/O''Reilly/);assert.match(result.text,/NULL/);
  sheet.getCell('A4').value={formula:'1+1',result:2};
  await assert.rejects(async()=>excelTestData(d,t.id,Buffer.from(await wb.xlsx.writeBuffer())),/수식/);
  sheet.getCell('A4').value='valid';sheet.getCell('A1').value='unknown';await assert.rejects(async()=>excelTestData(d,t.id,Buffer.from(await wb.xlsx.writeBuffer())),/컬럼/);
  sheet.getCell('A1').value=null;t.columns[1].nullable=false;await assert.rejects(async()=>excelTestData(d,t.id,Buffer.from(await wb.xlsx.writeBuffer())),/필수 컬럼/);
});
