import React,{useState} from 'react';
import {definitionColors,tableHeaderColors} from './model';
const colors=['#168d86','#2563eb','#7c3aed','#be185d','#b45309','#334155','#e2e8f0','#ffffff'];
export default function HeaderColorDialog({doc,tableIds,onApply}) {
  const selected=doc.tables.filter(t=>tableIds.includes(t.id)),[scope,setScope]=useState(selected.length?'selected':'all');
  const [color,setColor]=useState(tableHeaderColors(doc,selected.length===1?selected[0]:null).header.toLowerCase());let preview,error;try{preview=definitionColors({headerColor:color});}catch(e){error=e.message;}
  return <div><p>ERD 화면에 보이는 테이블의 헤더 배경색을 변경합니다. 색상은 프로젝트에 저장됩니다.</p><label>적용 범위<select aria-label="ERD 헤더 색상 적용 범위" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">프로젝트 전체 테이블</option><option value="selected" disabled={!selected.length}>선택한 테이블 {selected.length}개</option></select></label>
    {scope==='selected'&&<p className="hint">{selected.map(t=>t.name).join(', ')}</p>}
    <div className="definition-presets">{colors.map(value=><button key={value} aria-label={`ERD 헤더 색상 ${value}`} aria-pressed={color.toLowerCase()===value} style={{background:value}} onClick={()=>setColor(value)}/>)}</div>
    <div className="definition-color-fields"><label>직접 선택<input type="color" aria-label="ERD 헤더 색상" value={preview?color:'#168d86'} onChange={e=>setColor(e.target.value)}/></label><label>HEX 색상<input aria-label="ERD 헤더 HEX" value={color} onChange={e=>setColor(e.target.value)}/></label></div>
    {preview&&<div className="erd-header-preview" style={{background:preview.header,color:preview.foreground}}>▦ {scope==='selected'&&selected.length===1?selected[0].name:'테이블 헤더 미리보기'}</div>}
    {error&&<p className="errors" role="alert">{error}</p>}<p className="hint">전체 적용은 개별 테이블 색상도 함께 변경합니다. 새 테이블은 프로젝트 색상을 따릅니다.</p><div className="modal-actions"><button onClick={()=>setColor('#168d86')}>기본 색상</button><button className="primary" disabled={!!error} onClick={()=>onApply({color,scope,tableIds:selected.map(t=>t.id)})}>ERD 화면에 적용</button></div>
  </div>;
}
