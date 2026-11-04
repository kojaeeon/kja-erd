import ExcelJS from 'exceljs';
import { validate, termType, typeParts, definitionColors,effectiveDictionary,synchronize } from './model.js';

const headers=['NO','PK','AI','FK','NULL','논리명','컬럼명','TYPE','DEFAULT','설명','참조 테이블'];
const widths=[7,6,6,6,7,24,28,22,22,36,28];
export async function exportExcel(document) {
  const d=validate(structuredClone(document)),colors=definitionColors(d.exportOptions);
  if(d.commonDictionary){synchronize(d);const merged=effectiveDictionary(d);d.words=merged.words;d.terms=merged.terms;d.types=merged.types;delete d.commonDictionary;}
  const workbook=new ExcelJS.Workbook();workbook.creator='KJA ERD';workbook.title=d.name;
  const taken=new Set();
  const sheetName=name=>{let base=String(name||'Table').replace(/[\\/*?:\[\]]/g,'_').replace(/^'+|'+$/g,'').slice(0,31)||'Table';let value=base,i=2;while(taken.has(value.toLowerCase())){const suffix=` (${i++})`;value=base.slice(0,31-suffix.length)+suffix;}taken.add(value.toLowerCase());return value;};
  const add=(name,columns)=>{const s=workbook.addWorksheet(sheetName(name),{properties:{defaultRowHeight:24},pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});s.columns=columns.map(width=>({width}));return s;};
  const styleHeader=(s,row)=>{const r=s.getRow(row);r.height=28;r.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.headerArgb}};c.font={name:'맑은 고딕',size:10,bold:true,color:{argb:colors.foregroundArgb}};c.alignment={vertical:'middle',wrapText:true};});};
  const refs=c=>d.relations.filter(r=>r.targetColumn===c.id).map(r=>d.tables.find(t=>t.id===r.source)?.name).filter(Boolean).join(', ');
  const row=(c,i)=>[i+1,c.pk?'Y':'',c.ai?'Y':'',refs(c)?'Y':'',c.nullable&&!c.pk?'Y':'',c.logical,c.name,c.type,c.default||'',c.description||'',refs(c)];
  const all=add('All Table List',widths);
  const words=add('Word Dictionary List',[7,25,28,8,45]);
  const terms=add('Name Dictionary List',[7,25,28,24,45,14,16,22]);
  const types=add('Type Dictionary List',[7,25,24,14,16,45]);
  const names=add('Table Name List',[7,32,30]);
  const columns=add('All Column List',[32,25,...widths]);
  words.mergeCells('A1:B1');words.getCell('A1').value='단어사전 이름';words.mergeCells('C1:E1');words.getCell('C1').value='단어사전';words.addRow(['NO','논리명','물리명','금지','설명']);d.words.forEach((w,i)=>words.addRow([i+1,w.logical,w.physical,'',w.description||'']));styleHeader(words,2);
  terms.mergeCells('A1:B1');terms.getCell('A1').value='용어사전 이름';terms.mergeCells('C1:H1');terms.getCell('C1').value='용어사전';terms.addRow(['NO','논리명','물리명','TYPE','설명','자리수','소수 자리수','기본 타입']);d.terms.forEach((t,i)=>{const final=termType(t,d.types),parts=typeParts(final);terms.addRow([i+1,t.logical,t.physical,final,t.description||'',parts.length?Number(parts.length):'',parts.scale!==''?Number(parts.scale):'',parts.base]);});styleHeader(terms,2);
  types.mergeCells('A1:B1');types.getCell('A1').value='타입사전 이름';types.mergeCells('C1:F1');types.getCell('C1').value='타입사전';types.addRow(['NO','TYPE NAME','TYPE','기본 자리수','기본 소수 자리수','설명']);d.types.forEach((t,i)=>{const final=termType({typeId:t.id},d.types),parts=typeParts(final);types.addRow([i+1,t.name,final,parts.length?Number(parts.length):'',parts.scale!==''?Number(parts.scale):'',t.description||'']);});styleHeader(types,2);
  names.addRow(['NO','테이블명','논리명']);styleHeader(names,1);
  columns.addRow(['테이블명','논리명',...headers]);styleHeader(columns,1);
  const tableSection=(sheet,t,start)=>{
    const indexText=unique=>t.indexes.filter(ix=>!!ix.unique===unique).map(ix=>`${ix.name}(${ix.columns.map(id=>t.columns.find(c=>c.id===id)?.name).filter(Boolean).join(', ')})`).join(', ');
    const summaries=[['테이블명',t.name],['논리명',t.logical],['테이블 설명',t.description||''],['PRIMARY KEY',t.columns.filter(c=>c.pk).map(c=>c.name).join(', ')],['FOREIGN KEY',t.columns.filter(c=>refs(c)).map(c=>c.name).join(', ')],['INDEX',indexText(false)],['UNIQUE INDEX',[indexText(true),...t.columns.filter(c=>c.unique).map(c=>c.name)].filter(Boolean).join(', ')]];
    summaries.forEach(([label,value],i)=>{const n=start+i;sheet.mergeCells(n,1,n,4);sheet.mergeCells(n,5,n,11);sheet.getCell(n,1).value=label;sheet.getCell(n,5).value=value;sheet.getCell(n,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.tintArgb}};sheet.getCell(n,1).font={name:'맑은 고딕',size:10,bold:true};sheet.getRow(n).height=Math.max(24,Math.ceil(String(value).length/90)*20);});
    sheet.getRow(start+7).values=headers;styleHeader(sheet,start+7);t.columns.forEach((c,i)=>{sheet.getRow(start+8+i).values=row(c,i);});
    return start+8+t.columns.length+2;
  };
  let cursor=1;
  d.tables.forEach((t,i)=>{const sheet=add(t.name,widths);tableSection(sheet,t,1);sheet.views=[{state:'frozen',ySplit:8}];sheet.autoFilter={from:'A8',to:`K${8+t.columns.length}`};sheet.pageSetup.printTitlesRow='1:8';cursor=tableSection(all,t,cursor);names.addRow([i+1,{text:t.name,hyperlink:`#'${sheet.name.replaceAll("'","''")}'!A1`},t.logical]);t.columns.forEach((c,j)=>columns.addRow([t.name,t.logical,...row(c,j)]));});
  if(!d.tables.length){all.addRow(headers);styleHeader(all,1);}
  for(const sheet of [words,terms,types]){sheet.views=[{state:'frozen',ySplit:2}];sheet.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,sheet.rowCount),column:sheet.columnCount}};}
  for(const sheet of [names,columns]){sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:sheet.columnCount}};}
  for(const sheet of workbook.worksheets)sheet.eachRow(r=>r.eachCell({includeEmpty:true},c=>{if(c.value==='')c.value=null;if(!c.font)c.font={name:'맑은 고딕',size:10,color:{argb:'FF344553'}};c.alignment={...c.alignment,vertical:'middle',wrapText:true};c.border={bottom:{style:'hair',color:{argb:'FFE3E9EE'}}};}));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
