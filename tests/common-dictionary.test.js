import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';
import {ProjectStore} from '../src/project-store.mjs';
import {CommonDictionaryStore} from '../src/common-dictionary-store.mjs';
import {blank,newTable,column,synchronize,effectiveDictionary,copyProject,dictionaryErrors,publishProjectDictionary} from '../src/model.js';
import {exportExcel} from '../src/excel-export.mjs';
const seed=()=>({revision:0,words:[{id:'w1',logical:'고객',physical:'customer'},{id:'w2',logical:'코드',physical:'code'}],types:[{id:'domain',name:'코드',type:'VARCHAR',length:'12',scale:''}],terms:[{id:'term',logical:'고객 코드',physical:'customer_code',typeId:'domain',wordIds:['w1','w2'],length:'',scale:''}]});
function project(name){const d=blank();d.name=name;d.tables=[{...newTable(),columns:[{...column('customer_code','고객 코드','VARCHAR(12)'),termId:'shared:terms:term'}]}];return d;}

test('shared dictionaries use SQLite tables, survive store recreation and enforce references and revision conflicts',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new CommonDictionaryStore(db);const saved=store.save(seed());assert.equal(saved.revision,1);assert.equal(new CommonDictionaryStore(db).read().terms[0].wordIds[1],'w2');assert.equal(db.prepare('SELECT COUNT(*) n FROM shared_domains').get().n,1);
    assert.throws(()=>store.save(seed()),e=>e.status===409);const invalid=structuredClone(saved);invalid.terms[0].typeId='missing';assert.throws(()=>store.save(invalid),/도메인 참조/);assert.equal(store.read().revision,1);
    assert.throws(()=>db.prepare('INSERT INTO shared_terms(id,logical,physical,domain_id) VALUES(?,?,?,?)').run('bad','잘못된 용어','bad','missing'),/FOREIGN KEY/);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});
test('project terms, words and domains win conflicts; shared IDs remain stable through project copying',()=>{
  const d=project('개별 우선');d.commonDictionary=seed();d.words=[{id:'localWord',logical:'거래처',physical:'CUSTOMER'}];d.types=[{id:'localDomain',name:'코드',type:'VARCHAR',length:'44',scale:''}];
  synchronize(d);assert.equal(d.tables[0].columns[0].type,'VARCHAR(44)');assert.equal(d.tables[0].columns[0].logical,'거래처 코드');
  d.words[0]={id:'localWord',logical:'고객',physical:'CLIENT'};synchronize(d);assert.equal(d.tables[0].columns[0].name,'CLIENT_code');
  d.terms=[{id:'localTerm',logical:'프로젝트 고객코드',physical:'customer_code',typeId:'localDomain',wordIds:[]}];synchronize(d);assert.equal(d.tables[0].columns[0].logical,'프로젝트 고객코드');assert.equal(effectiveDictionary(d).terms.length,1);
  d.terms.push({id:'localTerm2',logical:'다른 용어',physical:'other',typeId:'shared:types:domain',wordIds:['shared:words:w2']});const copied=copyProject(d);assert.equal(copied.tables[0].columns[0].termId,'shared:terms:term');assert.equal(copied.terms[1].typeId,'shared:types:domain');assert.deepEqual(copied.terms[1].wordIds,['shared:words:w2']);assert.equal(dictionaryErrors(d).length,0);
});
test('public changes synchronize inactive projects atomically while preserving private overrides and snapshots are not stored in project JSON',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db),common=store.common.save(seed()),a=project('A'),b=project('B');a.types=[{id:'own',name:'코드',type:'VARCHAR',length:'44',scale:''}];store.save(a.id,a);store.save(b.id,b);
    assert.equal(store.get(a.id).tables[0].columns[0].type,'VARCHAR(44)');const changed=structuredClone(common);changed.types[0].length='20';const result=store.common.save(changed);assert.equal(result.updatedProjects,1);
    const raw=JSON.parse(db.prepare('SELECT document FROM projects WHERE id=?').get(b.id).document);assert.equal(raw.tables[0].columns[0].type,'VARCHAR(20)');assert.equal(raw.commonDictionary,undefined);assert.deepEqual(raw.types,[]);assert.equal(store.get(a.id).tables[0].columns[0].type,'VARCHAR(44)');
    const deleted=store.common.read();deleted.terms=[];store.common.save(deleted);const detached=store.get(b.id).tables[0].columns[0];assert.equal(detached.termId,'');assert.equal(detached.name,'customer_code');assert.equal(detached.type,'VARCHAR(20)');
  }finally{db.close();}
});
test('removing a shadowed shared term retains the private definition; project publishing keeps existing common definitions',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.common.save(seed());const d=project('A');d.types=[{id:'own',name:'코드',type:'VARCHAR',length:'40',scale:''}];d.terms=[{id:'ownTerm',logical:'프로젝트 코드',physical:'customer_code',typeId:'own',wordIds:[]}];store.save(d.id,d);
    const deleted=store.common.read();deleted.terms=[];store.common.save(deleted);const c=store.get(d.id).tables[0].columns[0];assert.equal(c.termId,'ownTerm');assert.equal(c.logical,'프로젝트 코드');assert.equal(c.type,'VARCHAR(40)');
    const published=publishProjectDictionary(d,store.common.read());assert.equal(published.types[0].length,'12');assert.equal(published.terms.length,1);assert.equal(published.terms[0].typeId,'domain');assert.equal(d.types[0].length,'40');
  }finally{db.close();}
});
test('shared dictionary definitions participate in Excel and project validation without copying them into project scope',async()=>{
  const d=project('정의서');d.commonDictionary=seed();synchronize(d);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await exportExcel(d));assert.equal(workbook.getWorksheet('Name Dictionary List').getCell('C3').value,'customer_code');assert.equal(workbook.getWorksheet('Name Dictionary List').getCell('D3').value,'VARCHAR(12)');assert.deepEqual(d.terms,[]);
  d.terms.push({id:'own',logical:'자체 용어',physical:'own',typeId:'shared:types:domain',wordIds:[]});assert.equal(dictionaryErrors(d).length,0);
});
test('project saves cannot replace the common dictionary with a stale or forged embedded snapshot',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.common.save(seed());const d=project('A');d.commonDictionary={...seed(),revision:999};d.commonDictionary.types[0].length='999';store.save(d.id,d);assert.equal(store.common.read().types[0].length,'12');assert.equal(store.get(d.id).tables[0].columns[0].type,'VARCHAR(12)');}finally{db.close();}
});
test('a failure during project propagation rolls back all common and project changes',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.common.save(seed());const d=project('A');store.save(d.id,d);const broken=project('broken');broken.relations=[{id:'bad',source:'missing',target:broken.tables[0].id,targetColumn:broken.tables[0].columns[0].id}];db.prepare('INSERT INTO projects(id,name,document,updated_at) VALUES(?,?,?,?)').run(broken.id,broken.name,JSON.stringify(broken),'2026-01-01');const edited=store.common.read();edited.types[0].length='20';assert.throws(()=>store.common.save(edited),/관계/);assert.equal(store.common.read().revision,1);assert.equal(store.common.read().types[0].length,'12');assert.equal(store.get(d.id).tables[0].columns[0].type,'VARCHAR(12)');}finally{db.close();}
});
test('deleting shared dependencies detaches project compositions while keeping the column definition',()=>{
  const db=new DatabaseSync(':memory:');try{const store=new ProjectStore(db);store.common.save(seed());const d=project('A');d.terms=[{id:'local',logical:'코드',physical:'code',typeId:'shared:types:domain',wordIds:['shared:words:w2']}];d.tables[0].columns[0].termId='local';store.save(d.id,d);const edited=store.common.read();edited.words=[];edited.types=[];edited.terms.forEach(t=>{t.typeId='';t.wordIds=[];});store.common.save(edited);const restored=store.get(d.id);assert.equal(restored.terms[0].typeId,'');assert.deepEqual(restored.terms[0].wordIds,[]);assert.equal(restored.tables[0].columns[0].type,'VARCHAR(12)');assert.equal(restored.tables[0].columns[0].name,'code');assert.deepEqual(dictionaryErrors(restored),[]);}finally{db.close();}
});
