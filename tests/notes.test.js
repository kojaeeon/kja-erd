import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {blank, copyProject, validate} from '../src/model.js';
import {ProjectStore} from '../src/project-store.mjs';
import {NOTE_DEFAULT_SIZE, NOTE_MIN_SIZE, noteSize, resizeNote, copyNoteText} from '../src/note.js';

test('legacy note content is preserved and resize persists through SQLite, JSON and project copy', () => {
  const doc=blank(), text="-- 고객 조회\nSELECT 'O''Reilly' AS name, 1 AS id;\n";
  doc.notes.push({id:'sql-note', text, position:{x:10,y:20}});
  assert.deepEqual(noteSize(doc.notes[0]),NOTE_DEFAULT_SIZE);
  resizeNote(doc,'sql-note',{x:-35,y:12,width:670,height:415});
  const db=new DatabaseSync(':memory:');
  try {
    const store=new ProjectStore(db);store.save(doc.id,doc);
    const saved=new ProjectStore(db).get(doc.id);
    assert.deepEqual(saved.notes[0],{id:'sql-note',text,position:{x:-35,y:12},width:670,height:415});
    assert.deepEqual(validate(JSON.parse(JSON.stringify(saved))).notes,saved.notes);
    const copy=copyProject(saved);
    assert.notEqual(copy.notes[0].id,saved.notes[0].id);
    assert.deepEqual({...copy.notes[0],id:'sql-note'},saved.notes[0]);
  } finally {db.close();}
});
test('resize boundaries preserve valid graph coordinates and a snapshot can undo one complete resize', () => {
  const doc=blank();doc.notes.push({id:'n',text:'SELECT 1;',position:{x:10,y:20}});
  const before=structuredClone(doc);
  resizeNote(doc,'n',{x:0,y:-50,width:1,height:0});
  assert.deepEqual(noteSize(doc.notes[0]),NOTE_MIN_SIZE);
  assert.deepEqual(doc.notes[0].position,{x:0,y:-50});
  resizeNote(doc,'n',{width:800,height:450,x:NaN,y:Infinity});
  assert.deepEqual(doc.notes[0].position,{x:0,y:-50});
  assert.deepEqual(before.notes[0],{id:'n',text:'SELECT 1;',position:{x:10,y:20}});
  assert.deepEqual(noteSize({width:NaN,height:Infinity}),NOTE_DEFAULT_SIZE);
  assert.deepEqual(noteSize({width:99999,height:99999}),{width:4000,height:4000});
});
test('copy icon sends literal SQL to Clipboard API and uses native fallback after permission denial', async () => {
  const text="SELECT '<script>&한글' AS value;\n-- SQL snippet\n";
  let copied, selected=false, removed=false, focused=false;
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const doc=Object.getOwnPropertyDescriptor(globalThis,'document');
  const input={style:{},focus(){},select(){selected=true},remove(){removed=true}};
  const container={appendChild(el){assert.equal(el,input)}};
  try {
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value}}}});
    await copyNoteText(text,container);assert.equal(copied,text);assert(!selected);
    globalThis.navigator.clipboard.writeText=async()=>{throw Error('NotAllowedError')};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{
      activeElement:{focus(){focused=true}},createElement:()=>input,
      execCommand(command){assert.equal(command,'copy');copied=input.value;return true},
    }});
    await copyNoteText(text,container);
    assert.equal(copied,text);assert(selected&&removed&&focused);
    globalThis.document.execCommand=()=>false;
    await assert.rejects(copyNoteText(text,container),/Ctrl\+C/);
  } finally {
    if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
    if(doc)Object.defineProperty(globalThis,'document',doc);else delete globalThis.document;
  }
});
