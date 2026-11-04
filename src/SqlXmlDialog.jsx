import React,{useState,useMemo} from 'react';
import {Copy,Download} from 'lucide-react';
import {javaName} from './java-vo';
import {generateSqlXml} from './sql-xml';
export default function SqlXmlDialog({doc,tableId,download,setStatus}) {
  const table=doc.tables.find(t=>t.id===tableId),base=javaName(table.name,'pascal');
  const [o,setO]=useState({namespace:`com.example.mapper.${base}Mapper`,voType:`com.example.vo.${base}VO`,style:'camel',prefix:'',jdbc:true,skipIdentity:true,skipDefaults:false,updateNulls:false,keyMode:'none',comments:true,select:true,insert:true,update:true,delete:true}),[edited,setEdited]=useState(null),[error,setError]=useState('');
  const r=useMemo(()=>{try{return generateSqlXml(doc,tableId,o);}catch(e){return {error:e.message};}},[doc,tableId,o]);const text=edited??r.text??'';
  const change=(key,value)=>{setO({...o,[key]:value});setEdited(null);setError('');};
  const check=(key,label)=><label className="check-label"><input type="checkbox" checked={o[key]} onChange={e=>change(key,e.target.checked)}/>{label}</label>;
  return <div><p><strong>{table.name}</strong> · {doc.dialect.toUpperCase()} · MyBatis Mapper XML</p><p className="hint">추천: 카멜케이스 + resultMap + jdbcType + 자동증가 제외. VO 생성 팝업과 필드명·접두어·클래스 경로를 맞추세요. Mapper 메서드는 VO 하나를 인자로 받는 형태입니다.</p>
    <div className="java-vo-options">
      <label>Mapper 네임스페이스<input aria-label="XML 네임스페이스" value={o.namespace} onChange={e=>change('namespace',e.target.value)}/></label>
      <label>VO 전체 클래스명<input aria-label="XML VO 타입" value={o.voType} onChange={e=>change('voType',e.target.value)}/></label>
      <label>필드명 변환<select aria-label="XML 필드명 변환" value={o.style} onChange={e=>change('style',e.target.value)}><option value="camel">카멜케이스 (추천)</option><option value="pascal">파스칼케이스</option><option value="snake">스네이크케이스</option><option value="upper">대문자</option><option value="lower">소문자</option><option value="original">원래 이름</option></select></label>
      <label>제거할 컬럼 접두어<input aria-label="XML 제거할 접두어" value={o.prefix} placeholder="예: COL_ (대소문자 구분)" onChange={e=>change('prefix',e.target.value)}/></label>
      <label>UPDATE의 NULL 처리<select aria-label="XML NULL 처리" value={o.updateNulls?'include':'skip'} onChange={e=>change('updateNulls',e.target.value==='include')}><option value="skip">NULL 필드 건너뛰기 (추천)</option><option value="include">NULL도 저장 (전체 필드 변경)</option></select></label>
      <label>자동증가 키 반환<select aria-label="XML 키 반환" value={o.keyMode} onChange={e=>change('keyMode',e.target.value)}><option value="none">반환 안 함 (기본)</option><option value="jdbc">JDBC useGeneratedKeys</option>{doc.dialect==='db2'&&<option value="db2">DB2 selectKey · IDENTITY_VAL_LOCAL</option>}</select></label>
      <div>{check('jdbc','jdbcType 명시 (NULL 바인딩)')}{check('skipIdentity','INSERT에서 자동증가 컬럼 제외')}{check('skipDefaults','INSERT에서 DB 기본값 컬럼 제외')}{check('comments','테이블 설명 주석')}</div>
      <div>{check('select','SELECT / 목록 조회')}{check('insert','INSERT')}{check('update','UPDATE')}{check('delete','DELETE')}</div>
    </div><p className="hint">조회 조건이 없으면 selectList는 전체를 조회합니다. NULL 건너뛰기 UPDATE에 값이 없으면 기존 값을 유지합니다. 복합 PK는 모두 WHERE에 사용합니다.</p>
    {(r.error||error)&&<p role="alert" className="errors">{r.error||error}</p>}
    {!r.error&&<>{r.warnings.map(w=><p key={w} className="hint">{w}</p>)}<textarea className="sql-output" aria-label="SQL XML 소스" spellCheck={false} value={text} onChange={e=>setEdited(e.target.value)}/><div className="modal-actions"><button onClick={()=>setEdited(null)}>소스 초기화</button><button onClick={async()=>{try{await navigator.clipboard.writeText(text);setStatus('SQL XML 복사 완료');}catch{setError('XML 소스를 선택하여 직접 복사하세요.');}}}><Copy size={15}/> 복사</button><button onClick={()=>download(r.fileName,text,'application/xml;charset=utf-8')}><Download size={15}/> .xml 다운로드</button></div></>}
  </div>;
}
