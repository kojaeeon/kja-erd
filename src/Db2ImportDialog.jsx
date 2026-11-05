import React,{useState,useRef,useEffect} from 'react';
import SqlImportDialog from './SqlImportDialog';
export default function Db2ImportDialog({doc,onApply}) {
  const [connection,setConnection]=useState({url:'jdbc:db2://localhost:50000/SAMPLE',user:'',password:'',schema:'',driverPath:''}),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const controller=useRef();useEffect(()=>()=>controller.current?.abort(),[]);
  const change=(key,value)=>{controller.current?.abort();setBusy(false);setConnection(p=>({...p,[key]:value}));setResult(null);setMessage('');setError('');};
  const load=async mode=>{const request=new AbortController();controller.current=request;setBusy(true);setError('');setMessage('');setResult(null);try{const response=await fetch('/api/db2/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(connection),signal:request.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'DB2 조회 실패');if(mode==='test')setMessage(`접속 성공 · ${data.product} ${data.version}`);else{setResult(data);setMessage(`메타 조회 완료 · ${data.tables.length}개 테이블`);}}catch(e){if(e.name!=='AbortError')setError(e.message);}finally{if(controller.current===request)setBusy(false);}};
  return <div><p>DB2 LUW JDBC 메타데이터를 읽어 테이블·컬럼·PK·FK·인덱스를 가져옵니다.</p><div className="java-vo-options">
    <label>JDBC 주소<input aria-label="DB2 JDBC 주소" value={connection.url} onChange={e=>change('url',e.target.value)} spellCheck={false}/></label>
    <label>계정<input aria-label="DB2 계정" autoComplete="off" value={connection.user} onChange={e=>change('user',e.target.value)}/></label>
    <label>비밀번호<input aria-label="DB2 비밀번호" type="password" autoComplete="new-password" value={connection.password} onChange={e=>change('password',e.target.value)}/></label>
    <label>스키마 (정확한 대소문자)<input aria-label="DB2 스키마" placeholder="APP" value={connection.schema} onChange={e=>change('schema',e.target.value)}/></label>
    <label>서버의 JDBC 드라이버 경로<input aria-label="DB2 JDBC 드라이버 경로" placeholder="drivers/db2jcc4.jar 또는 DB2_JDBC_JAR 환경변수" value={connection.driverPath} onChange={e=>change('driverPath',e.target.value)}/></label>
  </div><p className="hint">앱 서버에 Java 17 이상과 IBM db2jcc4.jar가 필요합니다. 접속 정보는 프로젝트·브라우저 저장소에 저장하지 않습니다. 실제 데이터 행이나 DDL은 실행하지 않습니다.</p>
  <div className="modal-actions"><button disabled={busy} onClick={()=>load('test')}>접속 테스트</button><button className="primary" disabled={busy} onClick={()=>load('metadata')}>{busy?'DB2 조회 중…':'메타데이터 조회'}</button></div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="errors">{error}</p>}{result&&<SqlImportDialog doc={doc} onApply={onApply} initialAnalysis={result}/>}</div>;
}
