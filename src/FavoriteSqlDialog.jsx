import React,{useMemo,useState} from 'react';
import {Copy,Download,RefreshCw} from 'lucide-react';
import {favoriteSql} from './table-sql';
export default function FavoriteSqlDialog({doc,tableId,download,setStatus}) {
  const table=doc.tables.find(t=>t.id===tableId),[active,setActive]=useState('backup'),[edited,setEdited]=useState({}),[error,setError]=useState('');
  const generated=useMemo(()=>{try{return {items:favoriteSql(doc,tableId)};}catch(e){return {items:[],error:e.message};}},[doc,tableId]);
  const item=generated.items.find(i=>i.id===active),text=item?(edited[item.id]??item.text):'';
  const all=generated.items.map(i=>`-- ${i.title}\n${edited[i.id]??i.text}`).join('\n\n');
  const copy=async value=>{try{await navigator.clipboard.writeText(value);setStatus('SQL 예시 복사 완료');}catch{setError('SQL을 선택하여 직접 복사하세요.');}};
  return <div className="favorite-sql-dialog"><p><strong>{table.name}</strong> · {doc.dialect.toUpperCase()} · 현재 테이블과 ERD 관계에 맞춘 SQL 예시</p><p className="hint">실행 전에 값·조회 조건·백업 테이블명을 수정하세요. DB2에서는 MERGE, FETCH NEXT, IDENTITY_VAL_LOCAL을 사용합니다.</p>
    {generated.error&&<p role="alert" className="errors">{generated.error}</p>}{error&&<p role="alert" className="errors">{error}</p>}
    <div className="sql-example-tabs">{generated.items.map(i=><button key={i.id} className={active===i.id?'active':''} onClick={()=>setActive(i.id)}>{i.title}</button>)}</div>
    {item&&<><div className="sql-example-heading"><strong>{item.title}</strong><button onClick={()=>setEdited(previous=>{const next={...previous};delete next[item.id];return next;})}><RefreshCw size={14}/> 예시 초기화</button></div><textarea className="sql-output" aria-label="즐겨쓰는 SQL 예시" value={text} spellCheck={false} onChange={e=>setEdited({...edited,[item.id]:e.target.value})}/><div className="modal-actions"><button onClick={()=>copy(text)}><Copy size={15}/> 현재 예시 복사</button><button onClick={()=>copy(all)}><Copy size={15}/> 전체 복사</button><button onClick={()=>download(`${table.name}.${doc.dialect}.examples.sql`,all,'text/plain')}><Download size={15}/> 전체 SQL 다운로드</button></div></>}
  </div>;
}
