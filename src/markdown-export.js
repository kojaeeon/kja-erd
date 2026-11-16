import {javaName} from './java-vo.js';

export const markdownFields = [
  ['no','NO'],['logical','논리명'],['name','컬럼명'],['camel','카멜케이스'],
  ['type','TYPE'],['pk','PK'],['ai','AI'],['fk','FK'],['nullable','NULL 허용'],
  ['unique','UNIQUE'],['default','DEFAULT'],['description','설명'],['references','참조 컬럼'],
].map(([id,label])=>({id,label}));
export const defaultMarkdownFields = ['no','logical','name','camel','type','pk','fk','nullable','default','description'];
export function selectedMarkdownFields(ids=defaultMarkdownFields) {
  const selected=new Set(Array.isArray(ids)?ids:defaultMarkdownFields);
  return markdownFields.filter(f=>selected.has(f.id));
}
// Encode user content before adding our own Markdown / HTML syntax.
export function markdownCell(value) {
  return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replace(/[\\`*_{}\[\]()#+.!~\-]/g,'\\$&').replaceAll('|','&#124;').replace(/\r\n?|\n/g,'<br>');
}
export function generateMarkdown(doc,{tableId,fields=defaultMarkdownFields}={}) {
  const selected=selectedMarkdownFields(fields);
  if(!selected.length)throw Error('출력 항목을 하나 이상 선택하세요.');
  const tables=tableId?doc.tables.filter(t=>t.id===tableId):doc.tables;
  if(!tables.length)throw Error('내보낼 테이블이 없습니다.');
  const sections=tables.map(table=>{
    const rows=table.columns.map((c,i)=>{
      const refs=(doc.relations||[]).filter(r=>r.target===table.id&&r.targetColumn===c.id).map(r=>{
        const parent=doc.tables.find(t=>t.id===r.source),column=parent?.columns.find(v=>v.id===r.sourceColumn);
        return parent&&column?[parent.schema,parent.name,column.name].filter(Boolean).join('.'):'';
      }).filter(Boolean).join(', ');
      return {no:i+1,logical:c.logical||'',name:c.name,camel:javaName(c.name),type:c.type,
        pk:c.pk?'Y':'',ai:c.ai?'Y':'',fk:refs?'Y':'',nullable:c.nullable&&!c.pk?'Y':'N',
        unique:c.unique?'Y':'',default:c.default??'',description:c.description||'',references:refs};
    });
    const heading=[table.schema,table.name].filter(Boolean).join('.')+(table.logical?` (${table.logical})`:'');
    const line=values=>`| ${values.join(' | ')} |`;
    const text=[`## ${markdownCell(heading)}`,'',...(table.description?[markdownCell(table.description),'']:[]),
      line(selected.map(f=>f.label)),line(selected.map(()=>'---')),
      ...rows.map(row=>line(selected.map(f=>markdownCell(row[f.id]))))].join('\n');
    return {id:table.id,heading,description:table.description||'',rows,text};
  });
  const name=tableId?tables[0].name:doc.name;
  return {fields:selected,sections,text:`# ${markdownCell(name)} 테이블 정의서\n\n${sections.map(s=>s.text).join('\n\n')}\n`,
    fileName:(String(name||'tables').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'tables')+'.md'};
}
