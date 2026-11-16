// Shared by the Excel file, preview and spreadsheet clipboard output.
export const definitionHeaders=['스키마','테이블명','테이블 논리명','테이블 설명','PRIMARY KEY','INDEX','UNIQUE INDEX','NO','컬럼명','컬럼 논리명','TYPE','PK','AI','FK','UNIQUE','NULL 허용','DEFAULT','컬럼 설명','참조 컬럼'];
export const definitionWidths=[20,28,24,36,28,36,36,7,28,24,22,6,6,6,10,12,22,36,32];

export function definitionRows(doc,tableId) {
  const tables=tableId?doc.tables.filter(t=>t.id===tableId):doc.tables;
  if(tableId&&!tables.length)throw Error('내보낼 테이블이 없습니다.');
  return tables.flatMap(t=>{
    const indexText=unique=>(t.indexes||[]).filter(ix=>!!ix.unique===unique).map(ix=>`${ix.name} (${ix.columns.map(id=>t.columns.find(c=>c.id===id)?.name).filter(Boolean).join(', ')})`).join(', ');
    const tableInfo=[t.schema||'',t.name,t.logical||'',t.description||'',t.columns.filter(c=>c.pk).map(c=>c.name).join(', '),indexText(false),[indexText(true),...t.columns.filter(c=>c.unique).map(c=>c.name)].filter(Boolean).join(', ')];
    if(!t.columns.length)return [[...tableInfo,...Array(definitionHeaders.length-tableInfo.length).fill('')]];
    return t.columns.map((c,i)=>{
      const refs=(doc.relations||[]).filter(r=>r.target===t.id&&r.targetColumn===c.id).map(r=>{
        const parent=doc.tables.find(v=>v.id===r.source),column=parent?.columns.find(v=>v.id===r.sourceColumn);
        return parent&&column?[parent.schema,parent.name,column.name].filter(Boolean).join('.'):'';
      }).filter(Boolean).join(', ');
      return [...tableInfo,i+1,c.name,c.logical||'',c.type,c.pk?'Y':'',c.ai?'Y':'',refs?'Y':'',c.unique?'Y':'',c.nullable&&!c.pk?'Y':'N',c.default??'',c.description||'',refs];
    });
  });
}

export function definitionClipboard(doc,tableId) {
  // Preserve embedded separators in one Excel cell and treat formula-like text literally.
  const cell=value=>{
    let text=String(value??'');
    if(/^\s*[=+@-]/.test(text))text="'"+text;
    return /[\t\r\n"]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
  };
  return [definitionHeaders,...definitionRows(doc,tableId)].map(row=>row.map(cell).join('\t')).join('\r\n');
}
