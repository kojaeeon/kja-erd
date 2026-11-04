import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {demo,newTable,tableHeaderColors,applyTableHeaderColor,copyProject,sql} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';
test('ERD header colors support individual overrides and project-wide inheritance without changing SQL or Excel options',()=>{
  const d=demo(),before=sql(d).text;d.exportOptions={headerColor:'#be185d'};
  applyTableHeaderColor(d,{color:'#2563eb',scope:'selected',tableIds:[d.tables[0].id]});assert.equal(tableHeaderColors(d,d.tables[0]).header,'#2563EB');assert.equal(tableHeaderColors(d,d.tables[1]).header,'#168D86');
  applyTableHeaderColor(d,{color:'#7c3aed',scope:'all'});assert.equal(d.tables[0].headerColor,undefined);assert.ok(d.tables.every(t=>tableHeaderColors(d,t).header==='#7C3AED'));assert.equal(tableHeaderColors(d,newTable()).header,'#7C3AED');assert.equal(d.exportOptions.headerColor,'#be185d');assert.equal(sql(d).text,before);
  applyTableHeaderColor(d,{color:'#ffffff',scope:'selected',tableIds:[d.tables[1].id]});assert.equal(tableHeaderColors(d,d.tables[1]).foreground,'#17212B');assert.throws(()=>applyTableHeaderColor(d,{color:'bad'}),/헤더 색상/);assert.throws(()=>applyTableHeaderColor(d,{color:'#2563eb',scope:'selected'}),/선택/);
});
test('ERD header colors persist in SQLite and copied projects; legacy and invalid colors remain readable',()=>{
  const d=demo(),db=new DatabaseSync(':memory:');try{applyTableHeaderColor(d,{color:'#334155'});applyTableHeaderColor(d,{color:'#ffffff',scope:'selected',tableIds:[d.tables[0].id]});const store=new ProjectStore(db);store.save(d.id,d);const restored=store.get(d.id),copy=copyProject(restored);assert.equal(tableHeaderColors(restored,restored.tables[0]).header,'#FFFFFF');assert.equal(tableHeaderColors(copy,copy.tables[1]).header,'#334155');assert.equal(tableHeaderColors({},{}).header,'#168D86');assert.equal(tableHeaderColors({appearance:{tableHeaderColor:'invalid'}},{}).header,'#168D86');}finally{db.close();}
});
