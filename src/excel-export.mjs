import ExcelJS from 'exceljs';
import {validate,definitionColors,synchronize} from './model.js';
import {definitionHeaders,definitionWidths,definitionRows} from './definition-rows.js';

export async function exportExcel(document,{tableId}={}) {
  const d=validate(structuredClone(document));
  if(d.commonDictionary)synchronize(d);
  const colors=definitionColors(d.exportOptions),rows=definitionRows(d,tableId);
  const workbook=new ExcelJS.Workbook();workbook.creator='KJA ERD';workbook.title=d.name;
  const sheet=workbook.addWorksheet('테이블 정의서',{properties:{defaultRowHeight:24},pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  sheet.columns=definitionWidths.map(width=>({width}));
  sheet.addRow(definitionHeaders);rows.forEach(row=>sheet.addRow(row));
  sheet.eachRow((row,n)=>row.eachCell({includeEmpty:true},cell=>{
    cell.font={name:'맑은 고딕',size:10,...(n===1?{bold:true,color:{argb:colors.foregroundArgb}}:{color:{argb:'FF344553'}})};
    cell.alignment={vertical:'middle',wrapText:true};
    cell.border={bottom:{style:'hair',color:{argb:'FFE3E9EE'}}};
    if(n===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colors.headerArgb}};
  }));
  sheet.getRow(1).height=28;sheet.views=[{state:'frozen',ySplit:1}];
  sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:definitionHeaders.length}};
  sheet.pageSetup.printTitlesRow='1:1';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
