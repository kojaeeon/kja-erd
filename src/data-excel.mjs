import ExcelJS from 'exceljs';
import {validate} from './model.js';
import {generateTestData,insertSql,defaultValue,typeInfo} from './table-sql.js';

export async function testDataTemplate(document,tableId,includeIdentity=false) {
  validate(document);const sample=generateTestData(document,tableId,{count:1,includeIdentity});
  const table=document.tables.find(t=>t.id===tableId),wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Test Data');
  sheet.addRow(sample.columns.map(c=>c.name));sheet.addRow(sample.columns.map(c=>c.logical));sheet.addRow(sample.columns.map(c=>c.type));
  if(!sample.columns.length)throw Error('자동증가 컬럼만 있습니다. 자동증가 포함을 켜거나 자동 생성 기능을 사용하세요.');
  sheet.addRow(sample.columns.map(c=>sample.rows[0][c.id]));
  sheet.views=[{state:'frozen',ySplit:3}];
  sample.columns.forEach((c,i)=>{sheet.getColumn(i+1).width=Math.max(18,Math.min(36,c.name.length+4));sheet.getColumn(i+1).numFmt='@';});
  [1,2,3].forEach(n=>{sheet.getRow(n).height=24;sheet.getRow(n).eachCell(cell=>{cell.font={name:'맑은 고딕',bold:n===1,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:n===1?'FF168D86':'FF547F80'}};});});
  const guide=wb.addWorksheet('Instructions');guide.getColumn(1).width=100;
  ['테이블: '+table.name,'Test Data 시트의 1~3행은 물리명·논리명·타입입니다. 수정하지 마세요.','4행부터 테스트 데이터를 입력하세요. 4행은 예시이므로 원하는 값으로 바꾸거나 삭제하세요.','빈 셀 또는 [NULL]은 SQL NULL, [DEFAULT]는 SQL DEFAULT입니다.','숫자 자리수를 정확히 유지하려면 텍스트 형식으로 입력하세요.','날짜: YYYY-MM-DD, 일시: YYYY-MM-DD HH:mm:ss, 이진 값: 16진수.','수식은 지원하지 않습니다. 계산 결과를 값으로 붙여 넣으세요.','자동증가 포함을 켜지 않으면 자동증가 컬럼은 INSERT에서 제외됩니다.','FK는 부모 테이블에 존재하는 키 값을 입력하세요. 부모 데이터는 자동 생성하지 않습니다.'].forEach(text=>guide.addRow([text]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function excelTestData(document,tableId,buffer,includeIdentity=false) {
  validate(document);const table=document.tables.find(t=>t.id===tableId);if(!table)throw Error('테이블을 찾을 수 없습니다.');
  if(buffer.length>2000000)throw Error('엑셀 파일은 2MB 이하만 지원합니다.');
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const sheet=wb.getWorksheet('Test Data');if(!sheet)throw Error('Test Data 시트가 없습니다. 제공한 양식을 사용하세요.');
  if(sheet.rowCount>10003||sheet.columnCount>table.columns.length)throw Error('엑셀 행 또는 컬럼 수가 허용 범위를 초과했습니다.');
  const mapping=[],seen=new Set();
  for(let i=1;i<=sheet.columnCount;i++){const cell=sheet.getCell(1,i);if(cell.value==null)continue;if(typeof cell.value!=='string')throw Error('물리명 헤더는 텍스트여야 합니다.');const name=cell.value.trim(),column=table.columns.find(c=>c.name===name);if(!column||seen.has(name))throw Error(`알 수 없거나 중복된 컬럼: ${name}`);seen.add(name);if(includeIdentity||!column.ai)mapping.push({column,index:i});}
  if(!mapping.length)throw Error('변환할 컬럼이 없습니다. 자동증가 포함 옵션과 양식 헤더를 확인하세요.');
  for(const c of table.columns)if(!seen.has(c.name)&&!c.ai&&!c.nullable&&!c.default)throw Error(`필수 컬럼이 없습니다: ${c.name}`);
  if((sheet.rowCount-3)*mapping.length>100000)throw Error('한 번에 100000개 셀까지 변환할 수 있습니다.');
  const rows=[];
  for(let row=4;row<=sheet.rowCount;row++){
    if(!mapping.some(m=>sheet.getCell(row,m.index).value!=null))continue;
    const values={};
    for(const {column,index} of mapping){let value=sheet.getCell(row,index).value;
      if(value&&typeof value==='object'&&!(value instanceof Date))throw Error(`${row}행 ${column.name}: 수식·오류·복합 셀은 지원하지 않습니다. 값으로 붙여 넣으세요.`);
      if(typeof value==='number'&&(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)))throw Error(`${row}행 ${column.name}: 큰 숫자는 텍스트 형식으로 입력하세요.`);
      if(value instanceof Date){const iso=value.toISOString(),base=typeInfo(column).base;value=base==='DATE'?iso.slice(0,10):base==='TIME'?iso.slice(11,19):iso.slice(0,19).replace('T',' ');}
      if(value==='[NULL]')value=null;if(value==='[DEFAULT]')value=defaultValue;
      values[column.id]=value;
    }rows.push(values);
  }
  if(!rows.length)throw Error('4행 이후에 테스트 데이터를 입력하세요.');
  const text=insertSql(document,table,mapping.map(m=>m.column),rows);
  if(text.length>5000000)throw Error('변환 SQL이 너무 큽니다. 행 수를 줄이세요.');
  return {text,count:rows.length,preview:rows.slice(0,5),columns:mapping.map(m=>m.column)};
}
