export const uid = () => crypto.randomUUID();
export const tableViewFields = [
  {key:'pk',label:'PK',width:25,default:true}, {key:'ai',label:'자동증가',width:48,default:true},
  {key:'fk',label:'FK',width:25,default:true}, {key:'nullable',label:'NULL',width:34,default:true},
  {key:'logical',label:'논리명',width:125,default:true}, {key:'name',label:'물리명',width:135,default:true},
  {key:'type',label:'타입',width:120,default:true}, {key:'unique',label:'UNIQUE',width:48,default:false},
  {key:'default',label:'기본값',width:120,default:false},
];
export function tableView(document) {
  const settings=Object.fromEntries(tableViewFields.map(f=>[f.key,typeof document.tableView?.[f.key]==='boolean'?document.tableView[f.key]:f.default]));
  if(!settings.logical&&!settings.name)settings.name=true;
  return settings;
}
export const dictionaryIdentity=(item,kind)=>[kind==='types'?item.name:item.physical,kind==='types'?'':item.logical].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean);
export const dictionaryConflict=(a,b,kind)=>{const norm=v=>String(v||'').trim().toLowerCase();return (kind==='types'?['name']:['physical','logical']).some(k=>!!norm(a[k])&&norm(a[k])===norm(b[k]));};
export function effectiveDictionary(document) {
  const common=document.commonDictionary||{},aliases={words:{},types:{},terms:{}};
  const prefix=(kind,id)=>id?'shared:'+kind+':'+id:'';
  const merge=(kind,shared,local,originals={})=>{
    const visible=[];for(const item of shared){const shadow=local.find(v=>v.id===item.id||dictionaryConflict(v,item,kind)||originals[item.id]&&dictionaryConflict(v,originals[item.id],kind));if(shadow)aliases[kind][item.id]=shadow.id;else visible.push({...item,_scope:'common'});}
    return [...local.map(v=>({...v,_scope:v._scope||'project'})),...visible];
  };
  const words=merge('words',(common.words||[]).map(v=>({...v,id:prefix('words',v.id)})),document.words||[]);
  const types=merge('types',(common.types||[]).map(v=>({...v,id:prefix('types',v.id)})),document.types||[]);
  const compose=term=>{const result={...term,typeId:aliases.types[term.typeId]||term.typeId,wordIds:(term.wordIds||[]).map(id=>aliases.words[id]||id)},parts=result.wordIds.map(id=>words.find(w=>w.id===id));if(parts.length&&parts.every(Boolean)){result.logical=parts.map(w=>w.logical).join(' ');result.physical=parts.map(w=>w.physical).join('_');}return result;};
  const originals=(common.terms||[]).map(v=>({...v,id:prefix('terms',v.id),typeId:prefix('types',v.typeId),wordIds:(v.wordIds||[]).map(id=>prefix('words',id))}));
  const sharedTerms=originals.map(compose);
  const terms=merge('terms',sharedTerms,(document.terms||[]).map(compose),Object.fromEntries(originals.map(v=>[v.id,v])));
  return {words,types,terms,aliases};
}
export function publishProjectDictionary(document,common) {
  const result=structuredClone(common),maps={words:{},types:{}};for(const kind of ['words','types'])for(const item of document[kind]){let target=result[kind].find(v=>dictionaryConflict(v,item,kind));if(!target){target={...item,id:uid()};result[kind].push(target);}maps[kind][item.id]=target.id;}
  const reference=(kind,id)=>maps[kind][id]||(id?.startsWith('shared:'+kind+':')?id.slice(('shared:'+kind+':').length):id)||'';
  for(const term of document.terms){if(result.terms.some(v=>dictionaryConflict(v,term,'terms')))continue;result.terms.push({...term,id:uid(),typeId:reference('types',term.typeId),wordIds:(term.wordIds||[]).map(id=>reference('words',id))});}return result;
}
export function copyProject(document) {
  const copy=structuredClone(validate(document)), ids=new Map();
  const replace=id=>{if(!ids.has(id))ids.set(id,uid());return ids.get(id);};
  copy.id=uid();copy.name+=' (복사)';
  for(const item of [...copy.words,...copy.types,...copy.terms,...copy.tables,...copy.notes,...copy.relations])item.id=replace(item.id);
  for(const term of copy.terms){if(term.typeId&&!term.typeId.startsWith('shared:'))term.typeId=replace(term.typeId);term.wordIds=term.wordIds?.map(id=>id.startsWith('shared:')?id:replace(id))||[];}
  for(const table of copy.tables){
    for(const c of table.columns){c.id=replace(c.id);if(c.termId&&!c.termId.startsWith('shared:'))c.termId=replace(c.termId);}
    for(const ix of table.indexes){ix.id=replace(ix.id);ix.columns=ix.columns.map(replace);}
  }
  for(const relation of copy.relations)for(const key of ['source','target','sourceColumn','targetColumn'])relation[key]=replace(relation[key]);
  return validate(copy);
}
export const column = (name = 'new_column', logical = '새 컬럼', type = 'TEXT') => ({ id: uid(), name, logical, type, pk: false, ai: false, nullable: true, unique: false, default: '', termId: '' });
export function columnIsInDictionary(column,terms) {
  const normalize=v=>String(v||'').trim().toLowerCase();
  return terms.some(term=>term.id===column.termId||!!normalize(column.name)&&normalize(term.physical)===normalize(column.name));
}
export function moveColumn(table,columnId,direction) {
  if(direction!==-1&&direction!==1)return false;
  const index=table.columns.findIndex(c=>c.id===columnId),next=index+direction;
  if(index<0||next<0||next>=table.columns.length)return false;
  [table.columns[index],table.columns[next]]=[table.columns[next],table.columns[index]];
  return true;
}
export function reorderColumn(table,sourceId,targetId,placement='before') {
  if(!['before','after'].includes(placement)||sourceId===targetId)return false;
  const source=table.columns.find(c=>c.id===sourceId);if(!source||!table.columns.some(c=>c.id===targetId))return false;
  const next=table.columns.filter(c=>c.id!==sourceId),index=next.findIndex(c=>c.id===targetId)+(placement==='after'?1:0);next.splice(index,0,source);
  if(next.every((c,i)=>c.id===table.columns[i].id))return false;table.columns=next;return true;
}
export function relationConnection(document,connection) {
  return {source:connection.source,target:connection.target,sourceColumn:connection.sourceHandle?.startsWith('out-')?connection.sourceHandle.slice(4):'',targetColumn:connection.targetHandle?.startsWith('in-')?connection.targetHandle.slice(3):''};
}
export function relationIssue(document,value,excludeId) {
  const parent=document.tables.find(t=>t.id===value.source),child=document.tables.find(t=>t.id===value.target);
  if(!parent?.columns.some(c=>c.id===value.sourceColumn)||!child?.columns.some(c=>c.id===value.targetColumn))return '부모와 자식 테이블의 컬럼을 선택하세요.';
  if(value.sourceColumn===value.targetColumn)return '같은 컬럼에는 연결할 수 없습니다. 다른 컬럼을 선택하세요.';
  if(document.relations.some(r=>r.id!==excludeId&&r.sourceColumn===value.sourceColumn&&r.targetColumn===value.targetColumn))return '이미 연결된 컬럼 관계입니다.';
  return '';
}
export function buildRelation(document,value) {
  const issue=relationIssue(document,value,value.id);if(issue)throw Error(issue);
  const description=String(value.description||'').trim();if(description.length>1000)throw Error('관계 설명은 1000자까지 입력하세요.');
  return {...value,id:value.id||uid(),cardinality:['1:N','1:1','0..1:N','1:0..N'].includes(value.cardinality)?value.cardinality:'1:N',identifying:!!value.identifying,onDelete:['NO ACTION','CASCADE','RESTRICT','SET NULL'].includes(value.onDelete)?value.onDelete:'NO ACTION',description};
}
export function definitionColors(options={}) {
  const header=options?.headerColor??'#168d86';if(typeof header!=='string'||!/^#[a-f\d]{6}$/i.test(header))throw Error('헤더 색상은 #168d86 같은 6자리 HEX로 입력하세요.');
  const rgb=[1,3,5].map(i=>parseInt(header.slice(i,i+2),16));const luminance=rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const tint=header.toLowerCase()==='#168d86'?'EDF8F6':rgb.map(v=>Math.round(v+(255-v)*.9).toString(16).padStart(2,'0')).join('').toUpperCase();
  return {header:header.toUpperCase(),foreground:luminance>.179?'#17212B':'#FFFFFF',headerArgb:'FF'+header.slice(1).toUpperCase(),foregroundArgb:luminance>.179?'FF17212B':'FFFFFFFF',tintArgb:'FF'+tint};
}
export function tableHeaderColors(document,table) {
  const color=table?.headerColor||document.appearance?.tableHeaderColor||'#168d86';
  try{return definitionColors({headerColor:color});}catch{return definitionColors();}
}
export function applyTableHeaderColor(document,{color,scope='all',tableIds=[]}) {
  const normalized=definitionColors({headerColor:color}).header.toLowerCase();
  if(scope==='all'){document.appearance={...document.appearance,tableHeaderColor:normalized};document.tables.forEach(t=>delete t.headerColor);}
  else if(scope==='selected'){
    const tables=document.tables.filter(t=>tableIds.includes(t.id));if(!tables.length)throw Error('색상을 바꿀 테이블을 선택하세요.');tables.forEach(t=>{t.headerColor=normalized;});
  }else throw Error('색상 적용 범위를 확인하세요.');
}
export const newTable = (index = 0, position) => ({ id: uid(), name: `table_${index + 1}`, logical: '새 테이블', position: position || { x: 100 + index * 35, y: 100 + index * 35 }, columns: [{ ...column('id', '아이디', 'INTEGER'), pk: true, ai: true, nullable: false }], indexes: [] });
export function blank() { return { version: 1, id: uid(), name: '새 ERD', dialect: 'db2', tables: [], relations: [], words: [], terms: [], types: [], notes: [] }; }
export function demo(dialect = 'db2') {
  const d = blank(); d.name = 'Blog · 개인용 ERD'; d.dialect = dialect;
  const make = (name, logical, x, y, cols) => ({ ...newTable(), name, logical, position: { x,y }, columns: cols });
  const pk = (name,logical) => ({ ...column(name,logical,'INTEGER'), pk: true, ai: true, nullable: false });
  const author = make('blog_author','저자',70,70,[pk('author_id','저자 아이디'),column('display_name','표시 이름'),column('email','이메일')]);
  const post = make('blog_post','게시글',690,80,[pk('post_id','게시글 아이디'),column('author_id','저자 아이디','INTEGER'),column('post_title','게시글 제목'),column('post_content','게시글 내용'),column('published_dt','공개 날짜','DATETIME')]);
  const category = make('blog_category','카테고리',70,430,[pk('category_id','카테고리 아이디'),column('category_name','카테고리 이름')]);
  const link = make('blog_post_to_category','게시글 카테고리',690,520,[{ ...column('post_id','게시글 아이디','INTEGER'),pk:true,nullable:false },{ ...column('category_id','카테고리 아이디','INTEGER'),pk:true,nullable:false }]);
  d.tables = [author,post,category,link];
  const relation = (a,ac,b,bc) => ({ id:uid(),source:a.id,sourceColumn:a.columns[ac].id,target:b.id,targetColumn:b.columns[bc].id,cardinality:'1:N',identifying:false,onDelete:'NO ACTION' });
  d.relations = [relation(author,0,post,1),relation(post,0,link,0),relation(category,0,link,1)];
  d.words = [{id:uid(),logical:'아이디',physical:'id'},{id:uid(),logical:'게시글',physical:'post'}];
  d.types = [{id:uid(),name:'아이디',type:'INTEGER'},{id:uid(),name:'이름',type:'TEXT'}];
  d.terms = [{id:uid(),logical:'게시글 아이디',physical:'post_id',typeId:d.types[0].id,wordIds:[d.words[1].id,d.words[0].id]}];
  post.columns[0].termId = d.terms[0].id;
  if (dialect === 'db2') {
    for (const table of d.tables) for (const c of table.columns) {
      if (c.type === 'TEXT') c.type = c.name === 'post_content' ? 'CLOB' : 'VARCHAR(255)';
      if (c.type === 'DATETIME') c.type = 'TIMESTAMP';
    }
    d.types[1].type = 'VARCHAR'; d.types[1].length = '255';
  }
  return d;
}
export function synchronize(d) {
  const dictionary=effectiveDictionary(d);
  for(const term of d.terms){if(d.commonDictionary){if(term.typeId?.startsWith('shared:')&&!dictionary.types.some(v=>v.id===(dictionary.aliases.types[term.typeId]||term.typeId)))term.typeId='';if(term.wordIds?.some(id=>id.startsWith('shared:')&&!dictionary.words.some(v=>v.id===(dictionary.aliases.words[id]||id))))term.wordIds=[];}const resolved=dictionary.terms.find(v=>v.id===term.id);if(resolved){term.logical=resolved.logical;term.physical=resolved.physical;}}
  for(const table of d.tables)for(const c of table.columns){
    const resolvedId=dictionary.aliases.terms[c.termId]||c.termId;
    const term=dictionary.terms.find(v=>v.id===resolvedId)||(c.termId?.startsWith('shared:')?dictionary.terms.find(v=>v._scope==='project'&&dictionaryConflict(v,{physical:c.name,logical:c.logical},'terms')):null);
    if(term){if(c.termId?.startsWith('shared:')&&!dictionary.terms.some(v=>v.id===resolvedId)&&!dictionary.aliases.terms[c.termId])c.termId=term.id;c.logical=term.logical;c.name=term.physical;const type=termType(term,dictionary.types);if(type)c.type=type;}
    else if(c.termId?.startsWith('shared:')&&d.commonDictionary)c.termId='';
  }
  return d;
}
export function typeParts(type = '') {
  const match = type.trim().match(/^([A-Za-z ]+?)(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?$/);
  return { base: (match?.[1] || type).trim().toUpperCase(), length: match?.[2] || '', scale: match?.[3] || '' };
}
export function sizeKind(type) {
  const {base} = typeParts(type);
  return ['DECIMAL','NUMERIC'].includes(base) ? 'decimal' : ['VARCHAR','CHAR','NVARCHAR','NCHAR','VARBINARY','BINARY','GRAPHIC','VARGRAPHIC','CLOB','DBCLOB','BLOB'].includes(base) ? 'length' : '';
}
export function termType(term, types) {
  const definition = types.find(t=>t.id===term.typeId);
  if (!definition) return '';
  const parts = typeParts(definition.type); const kind = sizeKind(parts.base);
  if(!kind) return definition.type;
  const value = (own, fallback) => own === '' || own == null ? fallback : own;
  const length = value(term.length, value(definition.length, parts.length));
  const scale = value(term.scale, value(definition.scale, parts.scale));
  return parts.base + (length!=='' ? `(${length}${kind==='decimal' && scale!=='' ? ','+scale : ''})` : '');
}
export function suggestTerms(terms, query) {
  const normalize = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko-KR');
  const search = normalize(query);
  if (!search) return [];
  const rank = term => {
    const names = [normalize(term.logical), normalize(term.physical)];
    return names.includes(search) ? 0 : names.some(name => name.startsWith(search)) ? 1 : 2;
  };
  return terms.filter(term => [term.logical, term.physical].some(name => normalize(name).includes(search)))
    .sort((a, b) => rank(a) - rank(b) || String(a.logical).localeCompare(String(b.logical), 'ko'));
}
export function dictionaryErrors(d) {
  const errors=[],dictionary=effectiveDictionary(d);
  for(const [key,label,name] of [['words','단어','physical'],['terms','용어','physical'],['types','타입','name']]) {
    const seen=new Set();
    for(const item of d[key]) {
      const value=(item[name]||'').trim().toLowerCase();
      if(!value)errors.push(`${label}: ${name==='name'?'타입 이름':'물리명'}을 입력하세요.`);
      else if(seen.has(value))errors.push(`${label}: 중복된 이름 ${item[name]}`);
      seen.add(value);
      if(key!=='types'&&!item.logical?.trim())errors.push(`${label} ${item[name]}: 논리명을 입력하세요.`);
    }
  }
  for(const item of [...d.types,...d.terms]) {
    const isTerm=d.terms.includes(item),resolved=isTerm?dictionary.terms.find(t=>t.id===item.id)||item:item; const def=isTerm?dictionary.types.find(t=>t.id===resolved.typeId):item;
    if(!def) { if(item.typeId) errors.push(`${item.logical}: 타입 참조가 없습니다.`);continue; }
    const parts=typeParts(isTerm?termType(resolved,dictionary.types):termType({typeId:item.id},[item]));
    const label=item.logical||item.name;const kind=sizeKind(def.type);
    const definitionParts=typeParts(def.type);
    const effectiveLength=item.length!==''&&item.length!=null?item.length:(def.length||definitionParts.length);
    const effectiveScale=item.scale!==''&&item.scale!=null?item.scale:(def.scale??definitionParts.scale);
    if(!/^[A-Z][A-Z ]*$/.test(typeParts(def.type).base))errors.push(`${label}: 기본 타입을 확인하세요.`);
    if(kind && parts.length!=='' && (!/^\d+$/.test(String(parts.length))||Number(parts.length)<1||!Number.isSafeInteger(Number(parts.length))))errors.push(`${label}: 자리수는 양의 정수여야 합니다.`);
    if(kind==='decimal'&&parts.scale!==''&&(!/^\d+$/.test(String(parts.scale))||parts.length===''||Number(parts.scale)>Number(parts.length)))errors.push(`${label}: 소수 자리수는 0 이상, 전체 자리수 이하여야 합니다.`);
    // Check raw values too: malformed numeric input cannot be parsed back into parts.
    if(kind && item.length!=='' && item.length!=null && (!/^\d+$/.test(String(item.length))||Number(item.length)<1))errors.push(`${label}: 올바른 자리수를 입력하세요.`);
    if(kind==='decimal'&&item.scale!==''&&item.scale!=null&&!/^\d+$/.test(String(item.scale)))errors.push(`${label}: 소수 자리수는 정수여야 합니다.`);
    if(kind==='decimal'&&effectiveScale!==''&&effectiveScale!=null&&(!effectiveLength||Number(effectiveScale)>Number(effectiveLength)))errors.push(`${label}: 소수 자리수에는 유효한 전체 자리수가 필요합니다.`);
  }
  return [...new Set(errors)];
}
export function importSqlTables(document,schema) {
  const existing=new Set(document.tables.map(t=>t.name.toLowerCase()));
  for(const table of schema) {
    if(existing.has(table.name.toLowerCase()))throw new Error(`이미 존재하는 테이블입니다: ${table.name}`);
    if(table.foreignKeys?.some(r=>r.seq>0))throw new Error(`${table.name}: 복합 외래키는 ERD 가져오기에서 아직 지원하지 않습니다.`);
    if(table.indexes?.some(ix=>ix.columns.some(name=>name==null)))throw new Error(`${table.name}: 표현식 인덱스는 ERD 가져오기에서 아직 지원하지 않습니다.`);
    existing.add(table.name.toLowerCase());
  }
  const baseY=document.tables.length?Math.max(...document.tables.map(t=>t.position.y+150+t.columns.length*32))+100:100;
  const tables=schema.map((t,i)=>({...newTable(),name:t.name,logical:t.name,position:{x:80+(i%2)*620,y:baseY+Math.floor(i/2)*350},columns:t.columns.map(c=>({...column(c.name,c.name,c.type||'BLOB'),pk:!!c.pk,nullable:!c.notnull&&!c.pk,default:c.dflt_value??'',ai:!!c.pk&&c.type.toUpperCase()==='INTEGER'&&/\bAUTOINCREMENT\b/i.test(t.sql)})),indexes:[]}));
  const relations=[];
  schema.forEach((source,i)=>{
    const child=tables[i];
    child.indexes=(source.indexes||[]).map(ix=>({id:uid(),name:ix.origin==='u'?`uq_${child.name}_${ix.columns.join('_')}`:ix.name,unique:!!ix.unique,columns:ix.columns.map(name=>child.columns.find(c=>c.name===name)?.id).filter(Boolean)}));
    for(const fk of source.foreignKeys||[]){const parent=[...tables,...document.tables].find(t=>t.name.toLowerCase()===fk.table.toLowerCase());const pc=parent?.columns.find(c=>fk.to?c.name===fk.to:c.pk);const cc=child.columns.find(c=>c.name===fk.from);if(!pc||!cc)throw new Error(`${child.name}: 외래키 참조 컬럼을 찾을 수 없습니다.`);relations.push({id:uid(),source:parent.id,sourceColumn:pc.id,target:child.id,targetColumn:cc.id,cardinality:'1:N',identifying:cc.pk,onDelete:fk.on_delete||'NO ACTION'});}
  });
  return {tables,relations};
}
export function validate(d) {
  if (!d || d.version !== 1 || typeof d.id !== 'string' || typeof d.name !== 'string' || !['sqlite','mysql','postgres','db2'].includes(d.dialect)) throw new Error('지원하지 않는 ERD 파일입니다.');
  for (const key of ['tables','relations','words','terms','types','notes']) if (!Array.isArray(d[key])) throw new Error(`${key} 목록이 없습니다.`);
  const ids = new Set();
  for(const t of d.tables) {
    if(!t.id || ids.has(t.id) || typeof t.name!=='string' || !Array.isArray(t.columns) || !Array.isArray(t.indexes) || !Number.isFinite(t.position?.x) || !Number.isFinite(t.position?.y)) throw new Error('테이블 형식이 올바르지 않습니다.');
    ids.add(t.id);
    for(const c of t.columns) { if(!c.id || ids.has(c.id) || typeof c.name!=='string' || typeof c.type!=='string') throw new Error('컬럼 형식이 올바르지 않습니다.'); ids.add(c.id); }
  }
  for(const r of d.relations) if(!d.tables.find(t=>t.id===r.source)?.columns.find(c=>c.id===r.sourceColumn) || !d.tables.find(t=>t.id===r.target)?.columns.find(c=>c.id===r.targetColumn)) throw new Error('관계가 존재하지 않는 컬럼을 참조합니다.');
  return d;
}
export const tableSqlName=(table,q)=>table.schema?`${q(table.schema)}.${q(table.name)}`:q(table.name);
export function sql(d, tableId, {includeForeignKeys = true} = {}) {
  const errors = []; const dialect = d.dialect; const q = s => dialect === 'mysql' ? '`'+s.replaceAll('`','``')+'`' : '"'+s.replaceAll('"','""')+'"';
  const tables = tableId ? d.tables.filter(t=>t.id===tableId) : d.tables;
  if (tableId && !tables.length) return {text:'',errors:['SQL을 출력할 테이블이 없습니다.'],externalTables:[]};
  const tableIds = new Set(tables.map(t=>t.id));
  const relations = includeForeignKeys ? d.relations.filter(r=>tableIds.has(r.target)) : [];
  const externalTables = [...new Set(relations.filter(r=>!tableIds.has(r.source)).map(r=>d.tables.find(t=>t.id===r.source)?.name).filter(Boolean))];
  const dataType = c => {
    const type = c.type.trim().toUpperCase();
    if (dialect === 'db2') return ({TEXT:'CLOB',DATETIME:'TIMESTAMP',INT:'INTEGER',NUMERIC:'DECIMAL',DOUBLE:'DOUBLE PRECISION'})[type] || type.replace(/^NUMERIC\(/,'DECIMAL(');
    return dialect==='postgres' && type==='DATETIME' ? 'TIMESTAMP' : c.type;
  };
  const names = new Set();
  for(const t of tables) {
    if(!t.name.trim() || names.has((t.schema||'').toLowerCase()+'.'+t.name.toLowerCase())) errors.push('빈 이름 또는 중복 테이블: '+t.name); names.add((t.schema||'').toLowerCase()+'.'+t.name.toLowerCase());
    const cn = new Set(); for(const c of t.columns) { if(!c.name.trim() || cn.has(c.name.toLowerCase())) errors.push(`${t.name}: 빈 이름 또는 중복 컬럼 ${c.name}`); cn.add(c.name.toLowerCase()); if(!/^[A-Za-z][A-Za-z0-9_]*(\s*\(\s*\d+[KMG]?(\s*,\s*\d+)?\s*\))?(\s+(UNSIGNED|PRECISION|VARYING|FOR BIT DATA))?$/i.test(c.type)) errors.push(`${t.name}.${c.name}: 타입 형식을 확인하세요.`); }
    if(!t.columns.length) errors.push(`${t.name}: 컬럼이 없습니다.`);
    for(const c of t.columns.filter(c=>c.ai)) if(dialect==='sqlite' && (!c.pk || t.columns.filter(c=>c.pk).length!==1 || c.type.toUpperCase()!=='INTEGER')) errors.push(`${t.name}.${c.name}: SQLite 자동 증가는 단일 INTEGER PK만 가능합니다.`);
    if (dialect === 'db2') {
      if (t.columns.filter(c=>c.ai).length > 1) errors.push(`${t.name}: DB2 IDENTITY 컬럼은 테이블당 하나만 지정할 수 있습니다.`);
      for (const c of t.columns) {
        const type = dataType(c), parts = typeParts(type);
        if (!/^(SMALLINT|INTEGER|BIGINT|DECIMAL|REAL|DOUBLE PRECISION|FLOAT|DECFLOAT|CHAR|CHARACTER|VARCHAR|CHARACTER VARYING|GRAPHIC|VARGRAPHIC|CLOB|DBCLOB|BLOB|BINARY|VARBINARY|DATE|TIME|TIMESTAMP|BOOLEAN|XML)(\b|\()/i.test(type)) errors.push(`${t.name}.${c.name}: DB2에서 지원하는 타입을 입력하세요 (${c.type}).`);
        if (c.ai && !(['SMALLINT','INTEGER','BIGINT'].includes(parts.base) || parts.base==='DECIMAL' && (!parts.scale || Number(parts.scale)===0))) errors.push(`${t.name}.${c.name}: DB2 IDENTITY는 정수 또는 소수 자리수 0인 DECIMAL 타입이 필요합니다.`);
        if (c.ai && c.default) errors.push(`${t.name}.${c.name}: DB2 IDENTITY 컬럼에는 DEFAULT를 함께 지정할 수 없습니다.`);
        if (c.unique && c.nullable && !c.pk) errors.push(`${t.name}.${c.name}: DB2 UNIQUE 제약 컬럼은 NULL을 허용할 수 없습니다. NULL을 해제하거나 UNIQUE 인덱스를 사용하세요.`);
        if (['DECIMAL'].includes(parts.base) && parts.length && (Number(parts.length)<1 || Number(parts.length)>31 || Number(parts.scale)>Number(parts.length))) errors.push(`${t.name}.${c.name}: DB2 DECIMAL 자리수는 1~31, 소수 자리수는 전체 자리수 이하여야 합니다.`);
        if (['VARCHAR','VARGRAPHIC','VARBINARY'].includes(parts.base) && (!parts.length || Number(parts.length)<1)) errors.push(`${t.name}.${c.name}: DB2 ${parts.base} 자리수를 입력하세요.`);
        if ((c.pk || c.unique || t.indexes.some(ix=>ix.columns.includes(c.id))) && /^(CLOB|DBCLOB|BLOB|XML)\b/.test(type)) errors.push(`${t.name}.${c.name}: DB2 LOB/XML 컬럼은 PK·UNIQUE·일반 인덱스로 지정할 수 없습니다.`);
      }
    }
  }
  for(const r of relations) {
    const t=d.tables.find(t=>t.id===r.source); const c=t?.columns.find(c=>c.id===r.sourceColumn);
    if(!c || (!c.pk && !c.unique) || (c.pk && t.columns.filter(c=>c.pk).length>1)) errors.push(`${t?.name || '관계'}: 단일 컬럼 FK 대상은 단일 PK 또는 UNIQUE여야 합니다.`);
    if (dialect==='db2' && r.onDelete==='SET NULL') {
      const child=d.tables.find(t=>t.id===r.target)?.columns.find(c=>c.id===r.targetColumn);
      if (child && (!child.nullable || child.pk)) errors.push(`${child.name}: DB2 ON DELETE SET NULL에는 NULL 허용 컬럼이 필요합니다.`);
    }
  }
  if(errors.length) return { text:'',errors,externalTables };
  const foreignKey = r => {
    const parent=d.tables.find(t=>t.id===r.source); const pc=parent.columns.find(c=>c.id===r.sourceColumn); const child=d.tables.find(t=>t.id===r.target); const cc=child.columns.find(c=>c.id===r.targetColumn);
    return `FOREIGN KEY (${q(cc.name)}) REFERENCES ${tableSqlName(parent,q)} (${q(pc.name)}) ON DELETE ${['NO ACTION','CASCADE','RESTRICT','SET NULL'].includes(r.onDelete)?r.onDelete:'NO ACTION'}`;
  };
  const statements = tables.map(t=>{
    const pks=t.columns.filter(c=>c.pk); const inline = dialect==='sqlite' && pks.length===1;
    const rows=t.columns.map(c=>`  ${q(c.name)} ${dataType(c)}${inline&&c.pk?' PRIMARY KEY':''}${(!c.nullable||c.pk||(dialect==='db2'&&c.ai))&&!(inline&&c.pk)?' NOT NULL':''}${c.ai?(dialect==='sqlite'?' AUTOINCREMENT':dialect==='mysql'?' AUTO_INCREMENT':` GENERATED ${dialect==='db2'&&c.identityMode==='ALWAYS'?'ALWAYS':'BY DEFAULT'} AS IDENTITY${dialect==='db2'&&c.identityOptions?' ('+c.identityOptions+')':''}`):''}${c.unique?' UNIQUE':''}${c.default?` DEFAULT ${c.default}`:''}`);
    if(pks.length&&!inline) rows.push(`  PRIMARY KEY (${pks.map(c=>q(c.name)).join(', ')})`);
    if (dialect!=='db2') for(const r of relations.filter(r=>r.target===t.id)) rows.push('  '+foreignKey(r));
    return `${t.logical?'-- '+t.logical.replaceAll('\n',' '):''}\nCREATE TABLE ${tableSqlName(t,q)} (\n${rows.join(',\n')}\n);`;
  });
  for(const t of tables) for(const ix of t.indexes) { const cols=ix.columns.map(id=>t.columns.find(c=>c.id===id)).filter(Boolean); if(cols.length) statements.push(`CREATE ${ix.unique?'UNIQUE ':''}INDEX ${ix.schema?q(ix.schema)+'.':''}${q(ix.name)} ON ${tableSqlName(t,q)} (${cols.map(c=>q(c.name)).join(', ')});`); }
  if (dialect==='db2') {
    for (const r of relations) statements.push(`ALTER TABLE ${tableSqlName(d.tables.find(t=>t.id===r.target),q)} ADD ${foreignKey(r)};`);
    const literal = text => "'"+text.replaceAll("'","''")+"'";
    for (const t of tables) {
      if (t.logical) statements.push(`COMMENT ON TABLE ${tableSqlName(t,q)} IS ${literal(t.logical)};`);
      for (const c of t.columns) if(c.logical) statements.push(`COMMENT ON COLUMN ${tableSqlName(t,q)}.${q(c.name)} IS ${literal(c.logical)};`);
    }
  }
  const prerequisite = externalTables.length ? `-- 먼저 생성되어 있어야 하는 참조 테이블: ${externalTables.map(n=>q(n).replaceAll('\n',' ')).join(', ')}\n\n` : '';
  return { text: prerequisite+(dialect==='sqlite'?'PRAGMA foreign_keys = ON;\n\n':'')+statements.join('\n\n'),errors,externalTables };
}
