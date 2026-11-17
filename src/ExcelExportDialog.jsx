import SchemaName from './SchemaName';
import React,{useState} from 'react';
import {Copy,Download} from 'lucide-react';
import {definitionColors} from './model';
import {definitionHeaders,definitionRows,definitionClipboard} from './definition-rows';
const presets=['#168d86','#2563eb','#7c3aed','#be185d','#b45309','#334155','#e2e8f0','#ffffff'];
export default function ExcelExportDialog({doc,tableId,onSave,onExport,setStatus,onSchemaChange}) {
  const [color,setColor]=useState(doc.exportOptions?.headerColor||'#168d86'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[fallback,setFallback]=useState('');
  const rowTables=doc.tables.filter(t=>!tableId||t.id===tableId).flatMap(t=>Array(Math.max(1,t.columns.length)).fill(t));
  let colors,error,rows=[];try{colors=definitionColors({headerColor:color});rows=definitionRows(doc,tableId);}catch(e){error=e.message;}
  const copy=async()=>{const text=definitionClipboard(doc,tableId);try{await navigator.clipboard.writeText(text);setFallback('');setMessage('복사했습니다. Excel에서 붙여 넣으세요.');setStatus?.('Excel 클립보드 복사 완료');}catch{setFallback(text);setMessage('아래 내용을 선택하여 복사한 뒤 Excel에 붙여 넣으세요.');}};
  return <div><p>{tableId?doc.tables.find(t=>t.id===tableId)?.name:`전체 ${doc.tables.length}개 테이블`} · 한 시트에 컬럼당 한 행으로 테이블·컬럼 정의를 출력합니다.</p><div className="definition-presets">{presets.map(value=><button key={value} aria-label={`헤더 색상 ${value}`} aria-pressed={color.toLowerCase()===value} style={{background:value}} onClick={()=>{setColor(value);setMessage('');}}/>)}</div>
    <div className="definition-color-fields"><label>직접 선택<input aria-label="테이블 정의서 헤더 색상" type="color" value={colors?color:'#168d86'} onChange={e=>setColor(e.target.value)}/></label><label>HEX 색상<input aria-label="테이블 정의서 헤더 HEX" value={color} onChange={e=>setColor(e.target.value)}/></label></div>
    {error&&<p className="errors" role="alert">{error}</p>}{colors&&<div className="definition-table-scroll"><table className="definition-preview"><thead style={{background:colors.header,color:colors.foreground}}><tr>{definitionHeaders.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((value,j)=><td key={j}>{j===0&&onSchemaChange?<SchemaName value={value} tableName={rowTables[i].name} onChange={schema=>onSchemaChange(rowTables[i].id,schema)}/>:value}</td>)}</tr>)}</tbody></table></div>}
    <p className="hint">스키마 셀을 클릭하면 변경할 수 있습니다. Enter 또는 포커스 이동으로 적용, Esc로 취소합니다. 빈 값은 스키마를 제거합니다. 클립보드 복사는 Excel에 붙여 넣을 수 있는 탭 구분 형식입니다. 헤더 색상은 xlsx 다운로드에 적용됩니다.</p>{message&&<p role="status">{message}</p>}
    {fallback&&<textarea className="sql-output" aria-label="Excel 클립보드 데이터" readOnly value={fallback} onFocus={e=>e.target.select()}/>}
    <div className="modal-actions"><button disabled={!!error||busy} onClick={()=>{onSave(color.toLowerCase());setMessage('헤더 색상을 저장했습니다.');}}>색상 설정 저장</button><button disabled={!!error||busy} onClick={copy}><Copy size={15}/> 클립보드 복사</button><button className="primary" disabled={!!error||busy} onClick={async()=>{setBusy(true);setMessage('');try{if(await onExport(color.toLowerCase()))setMessage('Excel 내보내기 완료');}finally{setBusy(false);}}}><Download size={15}/>{busy?'생성 중…':'xlsx 다운로드'}</button></div>
  </div>;
}
