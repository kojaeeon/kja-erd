import React,{useState} from 'react';
import {Copy,Download} from 'lucide-react';
import {markdownFields,defaultMarkdownFields,selectedMarkdownFields,generateMarkdown} from './markdown-export';

export default function MarkdownExportDialog({doc,tableId,download,onSave,setStatus}) {
  const [fields,setFields]=useState(()=>selectedMarkdownFields(doc.exportOptions?.markdownFields).map(f=>f.id));
  const [source,setSource]=useState(false),[message,setMessage]=useState('');
  let result,error;
  try{result=generateMarkdown(doc,{tableId,fields});}catch(e){error=e.message;}
  const toggle=(id,checked)=>{setFields(current=>checked?[...current,id]:current.filter(v=>v!==id));setMessage('');};
  const save=()=>{onSave(fields);setMessage('출력 항목 설정을 저장했습니다.');};
  return <div className="markdown-export-dialog">
    <p>{tableId?doc.tables.find(t=>t.id===tableId)?.name:`전체 ${doc.tables.length}개 테이블`} · Markdown 테이블 정의서</p>
    <fieldset className="markdown-field-options"><legend>출력 항목</legend><div className="markdown-field-checks">
      {markdownFields.map(f=><label key={f.id} className="check-label"><input type="checkbox" checked={fields.includes(f.id)} onChange={e=>toggle(f.id,e.target.checked)}/>{f.label}</label>)}
    </div><div className="modal-actions"><button onClick={()=>setFields(markdownFields.map(f=>f.id))}>전체 선택</button><button onClick={()=>setFields([])}>전체 해제</button><button onClick={()=>setFields([...defaultMarkdownFields])}>기본값</button></div></fieldset>
    <p className="hint">컬럼명에서 카멜케이스를 생성합니다. 예: CUSTOMER_ID → customerId. Java VO와 같은 이름 변환 규칙을 사용합니다. 설정은 프로젝트에 저장할 수 있습니다.</p>
    {error&&<p className="errors" role="alert">{error}</p>}
    <div className="sql-example-tabs"><button aria-pressed={!source} onClick={()=>setSource(false)}>표 미리보기</button><button aria-pressed={source} onClick={()=>setSource(true)}>MD 소스</button></div>
    {result&&(source?<textarea className="sql-output" aria-label="Markdown 소스" readOnly spellCheck={false} value={result.text}/>:<div className="markdown-preview">{result.sections.map(s=><section key={s.id}><h3>{s.heading}</h3>{s.description&&<p>{s.description}</p>}<div className="markdown-table-scroll"><table><thead><tr>{result.fields.map(f=><th key={f.id}>{f.label}</th>)}</tr></thead><tbody>{s.rows.map((r,i)=><tr key={i}>{result.fields.map(f=><td key={f.id}>{r[f.id]}</td>)}</tr>)}</tbody></table></div>{!s.rows.length&&<p className="hint">컬럼이 없습니다.</p>}</section>)}</div>)}
    {message&&<p role="status">{message}</p>}
    <div className="modal-actions"><button disabled={!fields.length} onClick={save}>출력 설정 저장</button><button disabled={!result} onClick={async()=>{try{await navigator.clipboard.writeText(result.text);setStatus('Markdown 복사 완료');setMessage('Markdown을 복사했습니다.');}catch{setSource(true);setMessage('MD 소스에서 텍스트를 선택하여 직접 복사하세요.');}}}><Copy size={15}/> 복사</button><button className="primary" disabled={!result} onClick={()=>{save();download(result.fileName,result.text,'text/markdown;charset=utf-8');setStatus('Markdown 내보내기 완료');}}><Download size={15}/> .md 다운로드</button></div>
  </div>;
}
