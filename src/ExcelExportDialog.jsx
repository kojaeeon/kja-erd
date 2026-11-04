import React,{useState} from 'react';
import {definitionColors} from './model';
const presets=['#168d86','#2563eb','#7c3aed','#be185d','#b45309','#334155','#e2e8f0','#ffffff'];
export default function ExcelExportDialog({doc,onSave,onExport}) {
  const [color,setColor]=useState(doc.exportOptions?.headerColor||'#168d86'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');let colors,error;try{colors=definitionColors({headerColor:color});}catch(e){error=e.message;}
  return <div><p>테이블 정의서의 헤더 색상을 선택하세요. 전체 테이블·테이블별 시트·사전과 목록 헤더에 적용하며, 이 프로젝트에 저장합니다.</p><div className="definition-presets">{presets.map(value=><button key={value} aria-label={`헤더 색상 ${value}`} aria-pressed={color.toLowerCase()===value} style={{background:value}} onClick={()=>{setColor(value);setMessage('');}}/>)}</div>
    <div className="definition-color-fields"><label>직접 선택<input aria-label="테이블 정의서 헤더 색상" type="color" value={colors?color:'#168d86'} onChange={e=>{setColor(e.target.value);setMessage('');}}/></label><label>HEX 색상<input aria-label="테이블 정의서 헤더 HEX" value={color} onChange={e=>{setColor(e.target.value);setMessage('');}}/></label></div>
    {error&&<p className="errors" role="alert">{error}</p>}{colors&&<table className="definition-preview"><thead style={{background:colors.header,color:colors.foreground}}><tr><th>NO</th><th>논리명</th><th>컬럼명</th><th>TYPE</th></tr></thead><tbody><tr><td>1</td><td>고객 아이디</td><td>CUSTOMER_ID</td><td>BIGINT</td></tr></tbody></table>}
    <p className="hint">배경색에 맞춰 글자색을 자동으로 조정합니다.</p>{message&&<p role="status">{message}</p>}<div className="modal-actions"><button disabled={!!error||busy} onClick={()=>{onSave(color.toLowerCase());setMessage('헤더 색상을 저장했습니다.');}}>색상 설정 저장</button><button className="primary" disabled={!!error||busy} onClick={async()=>{setBusy(true);setMessage('');try{if(await onExport(color.toLowerCase()))setMessage('Excel 내보내기 완료');}finally{setBusy(false);}}}>{busy?'생성 중…':'설정 저장 후 Excel 내보내기'}</button></div>
  </div>;
}
