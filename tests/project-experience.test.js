import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {demo,blank,reorderColumn,definitionColors,sql} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';
import {startupDocument} from '../src/startup.js';
import {exportExcel} from '../src/excel-export.mjs';

test('last opened project wins over last autosaved project, survives store reload, and falls back after trash',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db),a=demo(),b=blank();store.save(a.id,a);store.save(b.id,b);store.rememberOpened(a.id);store.save(b.id,{...b,name:'edited in another tab'});
    assert.equal(new ProjectStore(db).startup().document.id,a.id);store.trash(a.id);assert.equal(store.startup().document.id,b.id);assert.throws(()=>store.rememberOpened(a.id));store.trash(b.id);assert.equal(store.startup().document,null);assert.ok(store.startup().deletedIds.includes(a.id));
  }finally{db.close();}
});
test('startup preserves newer unsaved work while ignoring stale, different-project and deleted drafts',()=>{
  const saved=demo(),draft={...saved,name:'unsaved changes'},time=Date.parse('2026-11-04T00:00:00Z'),session={document:saved,updatedAt:new Date(time).toISOString()};
  assert.equal(startupDocument(session,JSON.stringify(draft),time+1).name,'unsaved changes');assert.equal(startupDocument(session,draft,time-1).name,saved.name);assert.equal(startupDocument(session,blank(),time+1).id,saved.id);assert.equal(startupDocument(session,'broken JSON',time+1).id,saved.id);
  assert.equal(startupDocument({document:null,deletedIds:[saved.id]},draft,time),null);assert.equal(startupDocument({document:null},draft,time).id,saved.id);
});
test('drag reordering inserts before or after target without changing column IDs, constraints, indexes or relations',()=>{
  const d=demo(),t=d.tables[1],ids=t.columns.map(c=>c.id),before=structuredClone(d);t.indexes.push({id:'ix',name:'ix_post',columns:[ids[2]],unique:true});
  assert.equal(reorderColumn(t,ids[0],ids[4],'after'),true);assert.deepEqual(t.columns.map(c=>c.id),[...ids.slice(1),ids[0]]);assert.deepEqual(d.relations,before.relations);assert.equal(t.indexes[0].columns[0],ids[2]);assert.equal(t.columns.at(-1).termId,before.tables[1].columns[0].termId);
  assert.equal(reorderColumn(t,ids[0],ids[1],'before'),true);assert.deepEqual(t.columns.map(c=>c.id),ids);assert.equal(reorderColumn(t,ids[0],ids[1],'before'),false);assert.equal(reorderColumn(t,ids[0],ids[0]),false);assert.equal(reorderColumn(t,'missing',ids[0]),false);assert.deepEqual(sql(d).errors,[]);
});
test('Excel header colors apply to all headers, adapt text contrast, persist per project and validate input',async()=>{
  for(const color of ['#2563eb','#ffffff']){const d=demo();d.exportOptions={headerColor:color};const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.save(d.id,d);assert.equal(store.get(d.id).exportOptions.headerColor,color);}finally{db.close();}
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await exportExcel(d));const colors=definitionColors(d.exportOptions);
    for(const [sheet,cell] of [['blog_post','A8'],['All Table List','A8'],['Word Dictionary List','A2'],['All Column List','A1']]){assert.equal(workbook.getWorksheet(sheet).getCell(cell).fill.fgColor.argb,colors.headerArgb);assert.equal(workbook.getWorksheet(sheet).getCell(cell).font.color.argb,colors.foregroundArgb);}
  }
  assert.equal(definitionColors().headerArgb,'FF168D86');assert.equal(definitionColors({headerColor:'#ffffff'}).foregroundArgb,'FF17212B');await assert.rejects(exportExcel({...demo(),exportOptions:{headerColor:'invalid'}}),/헤더 색상/);
});
