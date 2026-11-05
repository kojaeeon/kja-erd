import React,{useState,useMemo,useEffect,useRef,useCallback} from 'react';
import {Search,X,ArrowUp,ArrowDown} from 'lucide-react';
import {searchErd} from './erd-search';
export function useErdSearch(doc,rf,setSelected,modal) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[caseSensitive,setCaseSensitive]=useState(false),[wholeWord,setWholeWord]=useState(false),[activeKey,setActiveKey]=useState(null);
  const input=useRef(),results=useMemo(()=>open?searchErd(doc,query,{caseSensitive,wholeWord}):[],[doc,query,caseSensitive,wholeWord,open]);
  const index=Math.max(0,results.findIndex(r=>r.key===activeKey)),active=results[index];
  const focus=useCallback(()=>{setOpen(true);requestAnimationFrame(()=>{input.current?.focus();input.current?.select();});},[]);
  const close=()=>{setOpen(false);document.querySelector('.react-flow')?.focus();};
  const navigate=useCallback(result=>{
    if(!result)return;setActiveKey(result.key);setSelected([result.tableId]);
    const table=[...document.querySelectorAll('[data-table-id]')].find(el=>el.dataset.tableId===result.tableId);
    const target=result.columnId?[...table?.querySelectorAll('[data-column-id]')||[]].find(el=>el.dataset.columnId===result.columnId):table?.querySelector('header');
    if(target){const rect=target.getBoundingClientRect(),center=rf.screenToFlowPosition({x:rect.left+rect.width/2,y:rect.top+rect.height/2});rf.setCenter(center.x,center.y,{zoom:Math.max(.85,rf.getZoom()),duration:200});}
  },[rf,setSelected]);
  const next=direction=>{if(results.length)navigate(results[(index+direction+results.length)%results.length]);};
  useEffect(()=>{if(active)navigate(active);},[active?.key,query,caseSensitive,wholeWord,doc.id,navigate]);
  useEffect(()=>{const handler=e=>{if(modal)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();e.stopPropagation();focus();}if(open&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(open&&e.key==='F3'){e.preventDefault();next(e.shiftKey?-1:1);}};window.addEventListener('keydown',handler,true);return()=>window.removeEventListener('keydown',handler,true);},[open,modal,focus,results,index,navigate]);
  const matches=useMemo(()=>new Map(results.map(r=>[r.key,r])),[results]);
  return {open,query,setQuery,caseSensitive,setCaseSensitive,wholeWord,setWholeWord,input,results,index,active,matches,focus,close,next,navigate};
}
function Highlight({text,query,caseSensitive}) {
  const needle=query.trim();if(!needle)return text;const haystack=caseSensitive?text:text.toLocaleLowerCase(),search=caseSensitive?needle:needle.toLocaleLowerCase(),parts=[];let from=0,at;
  while((at=haystack.indexOf(search,from))>=0){parts.push(text.slice(from,at),<mark key={at}>{text.slice(at,at+needle.length)}</mark>);from=at+needle.length;}parts.push(text.slice(from));return parts;
}
export default function ErdSearch({search:s}) {
  const activeRef=useRef();useEffect(()=>{activeRef.current?.scrollIntoView({block:'nearest'});},[s.active?.key]);
  if(!s.open)return null;
  return <section className="erd-search nodrag nopan nowheel" aria-label="ERD 검색" onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();s.next(e.shiftKey?-1:1);}}}>
    <div className="erd-search-bar"><Search size={16}/><input ref={s.input} aria-label="논리명 또는 물리명 검색" placeholder="논리명 / 물리명 검색" value={s.query} onChange={e=>s.setQuery(e.target.value)}/><button aria-label="대소문자 구분" aria-pressed={s.caseSensitive} title="대소문자 구분" onClick={()=>s.setCaseSensitive(v=>!v)}>Aa</button><button aria-label="이름 전체 일치" aria-pressed={s.wholeWord} title="이름 전체 일치" onClick={()=>s.setWholeWord(v=>!v)}>ab</button><button aria-label="검색 닫기" onClick={s.close}><X size={16}/></button></div>
    <div className="erd-search-navigation"><span role="status">{s.query.trim()?(s.results.length?`${s.index+1} / ${s.results.length}개 결과`:'검색 결과 없음'):'테이블·컬럼의 논리명과 물리명을 검색합니다'}</span><button aria-label="이전 검색 결과" title="이전 (Shift+Enter)" disabled={!s.results.length} onClick={()=>s.next(-1)}><ArrowUp size={15}/></button><button aria-label="다음 검색 결과" title="다음 (Enter)" disabled={!s.results.length} onClick={()=>s.next(1)}><ArrowDown size={15}/></button></div>
    <div className="erd-search-results">{s.results.map(r=><button key={r.key} ref={r.key===s.active?.key?activeRef:null} aria-current={r.key===s.active?.key?'true':undefined} onClick={()=>s.navigate(r)}><small>{r.columnId?'컬럼 · '+r.tableName:'테이블'}</small><strong><Highlight text={r.logical||'—'} query={s.query} caseSensitive={s.caseSensitive}/></strong><span><Highlight text={r.name} query={s.query} caseSensitive={s.caseSensitive}/></span></button>)}</div>
    <small className="erd-search-help">Enter 다음 · Shift+Enter 이전 · Esc 닫기</small>
  </section>;
}
