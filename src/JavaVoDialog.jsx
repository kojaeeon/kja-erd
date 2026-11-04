import React,{useMemo,useState} from 'react';
import {Copy,Download} from 'lucide-react';
import {javaName,generateJavaVo} from './java-vo';
export default function JavaVoDialog({doc,tableId,download,setStatus}) {
  const table=doc.tables.find(t=>t.id===tableId);
  const [options,setOptions]=useState({style:'camel',className:javaName(table.name,'pascal')+'VO',packageName:'',prefix:'',boxed:true,dates:'modern',accessors:'plain',comments:true,serializable:false}),[edited,setEdited]=useState(null),[error,setError]=useState('');
  const result=useMemo(()=>{try{return generateJavaVo(table,options);}catch(e){return {error:e.message};}},[table,options]);
  const change=(key,value)=>{setOptions({...options,[key]:value});setEdited(null);setError('');};const text=edited??result.text??'';
  return <div><p><strong>{table.name}</strong> · Java VO 생성</p><p className="hint">추천: lowerCamelCase, 래퍼 타입(NULL 표현), java.time. Lombok을 선택하면 Java 프로젝트에 Lombok 의존성이 필요합니다.</p>
    <div className="java-vo-options">
      <label>클래스명<input aria-label="VO 클래스명" value={options.className} onChange={e=>change('className',e.target.value)}/></label>
      <label>패키지명<input aria-label="VO 패키지명" placeholder="com.example.vo" value={options.packageName} onChange={e=>change('packageName',e.target.value)}/></label>
      <label>필드명 변환<select aria-label="VO 필드명 변환" value={options.style} onChange={e=>change('style',e.target.value)}><option value="camel">카멜케이스 (추천) · postTitle</option><option value="pascal">파스칼케이스 · PostTitle</option><option value="snake">스네이크케이스 · post_title</option><option value="upper">대문자 · POST_TITLE</option><option value="lower">소문자 · post_title</option><option value="original">원래 이름 유지</option></select></label>
      <label>제거할 컬럼 접두어<input aria-label="VO 제거할 접두어" placeholder="예: COL_ (대소문자 구분)" value={options.prefix} onChange={e=>change('prefix',e.target.value)}/></label>
      <label>숫자 / 논리 타입<select aria-label="VO 숫자 타입" value={options.boxed?'boxed':'primitive'} onChange={e=>change('boxed',e.target.value==='boxed')}><option value="boxed">래퍼 (추천) · Integer / Boolean</option><option value="primitive">기본형 · int / boolean (NULL 불가)</option></select></label>
      <label>날짜 / 시간 타입<select aria-label="VO 날짜 타입" value={options.dates} onChange={e=>change('dates',e.target.value)}><option value="modern">java.time (추천)</option><option value="sql">java.sql · Date / Time / Timestamp</option></select></label>
      <label>Getter / Setter<select aria-label="VO 접근자" value={options.accessors} onChange={e=>change('accessors',e.target.value)}><option value="plain">직접 생성 (추가 의존성 없음)</option><option value="lombok">Lombok @Getter / @Setter</option><option value="none">필드만 생성</option></select></label>
      <div><label className="check-label"><input type="checkbox" checked={options.comments} onChange={e=>change('comments',e.target.checked)}/> 논리명 / 타입 주석</label><label className="check-label"><input type="checkbox" checked={options.serializable} onChange={e=>change('serializable',e.target.checked)}/> Serializable</label></div>
    </div>
    {!options.boxed&&<p className="hint">기본형 필드는 DB의 NULL 값을 표현할 수 없습니다.</p>}
    {(result.error||error)&&<p role="alert" className="errors">{result.error||error}</p>}
    {!result.error&&<><div className="test-data-preview"><table><thead><tr><th>컬럼</th><th>Java 필드</th><th>Java 타입</th></tr></thead><tbody>{result.fields.map(f=><tr key={f.column.id}><td>{f.column.name}</td><td>{f.name}</td><td>{f.type}</td></tr>)}</tbody></table></div><p className="hint">미지원 SQL 타입은 String으로 변환합니다. 옵션 변경 시 미리보기가 다시 생성됩니다.</p><textarea className="sql-output" aria-label="Java VO 소스" spellCheck={false} value={text} onChange={e=>setEdited(e.target.value)}/><div className="modal-actions"><button onClick={()=>setEdited(null)}>소스 초기화</button><button onClick={async()=>{try{await navigator.clipboard.writeText(text);setStatus('Java VO 복사 완료');}catch{setError('소스를 선택하여 직접 복사하세요.');}}}><Copy size={15}/> 복사</button><button onClick={()=>download(result.className+'.java',text,'text/plain;charset=utf-8')}><Download size={15}/> .java 다운로드</button></div></>}
  </div>;
}
