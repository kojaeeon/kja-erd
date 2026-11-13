import React,{useState,useRef,useEffect} from 'react';
import SqlImportDialog from './SqlImportDialog';
export default function MetadataImportDialog({doc,onApply}) {
  const [schema,setSchema]=useState(''),[search,setSearch]=useState('');
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef();
  useEffect(()=>()=>controller.current?.abort(),[]);
  const change=(set,value)=>{controller.current?.abort();controller.current=null;setBusy(false);set(value);setResult(null);setError('');};
  const load=async()=>{
    const request=new AbortController();controller.current=request;setBusy(true);setError('');setResult(null);
    try{
      const response=await fetch('/api/metadata/tables?'+new URLSearchParams({schema,search}),{signal:request.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'메타데이터 조회 실패');
      if(controller.current===request)setResult(data);
    }catch(e){if(e.name!=='AbortError'&&controller.current===request)setError(e.message);}
    finally{if(controller.current===request)setBusy(false);}
  };
  useEffect(()=>{load();},[]);
  return <div>
    <p><strong>SQLite 메타데이터 → ERD</strong> · <code>data/erd.sqlite</code>에 직접 등록한 테이블·컬럼을 가져옵니다.</p>
    <details><summary>데이터 입력 방법 / SQL 다운로드</summary>
      <ol><li>앱을 한 번 실행하면 빈 <code>metadata_tables</code>와 <code>metadata_columns</code>가 생성됩니다.</li>
      <li>DBeaver 등에서 서버 폴더의 <code>data/erd.sqlite</code>를 열고 테이블 정보 → 컬럼 정보 순서로 입력한 뒤 커밋하세요.</li>
      <li>아래에서 조회하고 원하는 테이블을 체크한 뒤 ERD에 적용하세요.</li></ol>
      <p className="hint">타입은 VARCHAR(100), DECIMAL(15,2)처럼 길이까지 입력합니다. PK=1이면 NULL 허용=0입니다. FK 관계와 인덱스는 가져온 뒤 ERD에서 편집하세요.</p>
      <div className="modal-actions"><a href="/api/metadata/schema" download>생성 SQL</a><a href="/api/metadata/example" download>INSERT 예제 SQL</a><a href="/api/metadata/guide" download>상세 입력 가이드</a></div>
    </details>
    <div className="java-vo-options"><label>스키마 (비우면 전체)<input aria-label="메타데이터 스키마" value={schema} maxLength={128} onChange={e=>change(setSchema,e.target.value)}/></label>
    <label>테이블명 / 논리명 검색<input aria-label="메타데이터 테이블 검색" value={search} maxLength={256} onChange={e=>change(setSearch,e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load();}}/></label></div>
    <div className="modal-actions"><button className="primary" disabled={busy} onClick={load}>{busy?'조회 중…':'메타데이터 조회 / 새로고침'}</button></div>
    {error&&<p role="alert" className="errors">{error}</p>}
    {result&&!result.tables.length&&<p role="status">등록된 테이블이 없거나 검색 결과가 없습니다. 입력 가이드의 INSERT 예제로 데이터를 넣고 다시 조회하세요.</p>}
    {result&&!!result.tables.length&&<SqlImportDialog doc={doc} onApply={onApply} initialAnalysis={result}/>}
  </div>;
}
