export function searchErd(document,query,{caseSensitive=false,wholeWord=false}={}) {
  const text=String(query||'').trim();if(!text)return [];
  const needle=caseSensitive?text:text.toLocaleLowerCase();
  const matches=value=>{const haystack=caseSensitive?String(value||''):String(value||'').toLocaleLowerCase();return wholeWord?haystack===needle:haystack.includes(needle);};
  const results=[];
  for(const table of document.tables){
    const add=(item,columnId=null)=>{const fields=['logical','name'].filter(field=>matches(item[field]));if(fields.length)results.push({key:JSON.stringify([table.id,columnId]),tableId:table.id,columnId,tableName:[table.schema,table.name].filter(Boolean).join('.'),name:item.name||'',logical:item.logical||'',fields});};
    add(table);for(const column of table.columns)add(column,column.id);
  }return results;
}
