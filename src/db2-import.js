import {column,newTable,uid,validate,synchronize,termType,effectiveDictionary} from './model.js';

// A bounded DDL reader, not a SQL executor. Unsupported constructs are reported.
function lex(sql) {
  const tokens=[];let i=0,line=1;
  while(i<sql.length){const start=i,row=line,ch=sql[i];
    if(/\s/.test(ch)){if(ch==='\n')line++;i++;continue;}
    if(sql.startsWith('--',i)){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
    if(sql.startsWith('/*',i)){i+=2;let depth=1;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else {if(sql[i]==='\n')line++;i++;}}if(depth)throw Error(`${row}행: 블록 주석이 닫히지 않았습니다.`);continue;}
    if(ch==='"'||ch==="'"||ch==='`'){i++;let value='',closed=false;while(i<sql.length){if(sql[i]===ch){if(sql[i+1]===ch){value+=ch;i+=2;}else{i++;closed=true;break;}}else{if(sql[i]==='\n')line++;value+=sql[i++];}}if(!closed)throw Error(`${row}행: 따옴표가 닫히지 않았습니다.`);tokens.push({value,kind:ch==="'"?'string':'quoted',start,end:i,line:row});continue;}
    const word=sql.slice(i).match(/^[\p{L}_$#@][\p{L}\p{N}_$#@]*/u)?.[0]||sql.slice(i).match(/^\d+(?:\.\d+)?/)?.[0];
    if(word){i+=word.length;tokens.push({value:word.toUpperCase(),kind:'word',start,end:i,line:row});}else{tokens.push({value:ch,kind:'symbol',start,end:++i,line:row});}
  }return tokens;
}
const is=(token,word)=>token?.kind==='word'&&token.value===word;
const key=t=>JSON.stringify([t.schema||'',t.name]);
export const ddlTableLabel=t=>[t.schema,t.name].filter(Boolean).join('.');
function nameAt(tokens,index=0){const parts=[];let i=index;do{const t=tokens[i];if(!t||!['word','quoted'].includes(t.kind))throw Error('식별자가 필요합니다.');parts.push(t.value);i++;if(tokens[i]?.value!=='.')break;i++;}while(true);return {parts,next:i,name:parts.at(-1),schema:parts.slice(0,-1).join('.')};}
function split(tokens,separator=','){let depth=0,begin=0;const result=[];for(let i=0;i<tokens.length;i++){if(tokens[i].kind==='symbol'){if(tokens[i].value==='(')depth++;if(tokens[i].value===')')depth--;if(depth===0&&tokens[i].value===separator){result.push(tokens.slice(begin,i));begin=i+1;}}}result.push(tokens.slice(begin));return result.filter(t=>t.length);}
function group(tokens,index){if(tokens[index]?.value!=='(')throw Error('괄호가 필요합니다.');let depth=1,i=index+1;for(;i<tokens.length;i++){if(tokens[i].kind!=='symbol')continue;if(tokens[i].value==='(')depth++;if(tokens[i].value===')'&&!--depth)break;}if(depth)throw Error('괄호가 닫히지 않았습니다.');return {body:tokens.slice(index+1,i),next:i+1};}
const columnNames=tokens=>split(tokens).map(part=>{const n=nameAt(part);if(n.next!==part.length)throw Error('컬럼 이름 목록을 확인하세요.');return n.name;});
const normalizeType=t=>String(t||'').toUpperCase().replace(/\s+/g,'').replace(/^INT$/,'INTEGER').replace(/^NUMERIC/,'DECIMAL').replace(/^CHARACTER VARYING/,'VARCHAR');

export function parseDb2Ddl(sql) {
  if(typeof sql!=='string'||sql.length>2_000_000)throw Error('SQL은 2MB 이하로 입력하세요.');
  const tokens=lex(sql),statements=split(tokens,';'),tables=[],diagnostics=[],later=[];let currentSchema='';
  const report=(level,message,token,table)=>diagnostics.push({level,message,line:token?.line||1,table:table?ddlTableLabel(table):''});
  const raw=t=>t.length?sql.slice(t[0].start,t.at(-1).end).trim():'';
  const resolve=n=>({name:n.name,schema:n.schema||currentSchema});
  const find=n=>tables.find(t=>key(t)===key(n));
  function constraint(table,tokens){let t=tokens;if(is(t[0],'CONSTRAINT'))t=t.slice(2);const primary=is(t[0],'PRIMARY'),unique=is(t[0],'UNIQUE');
    if(primary||unique){const g=group(t,primary?2:1),names=columnNames(g.body);for(const name of names)if(!table.columns.some(c=>c.name===name))throw Error(`제약 컬럼을 찾을 수 없습니다: ${name}`);
      if(primary){if(table.columns.some(c=>c.pk))throw Error('PRIMARY KEY가 중복 정의되었습니다.');for(const c of table.columns)if(names.includes(c.name)){c.pk=true;c.nullable=false;}}
      else table.indexes.push({name:tokens[0]?.value==='CONSTRAINT'?tokens[1].value:`uq_${table.name}_${names.join('_')}`,unique:true,columns:names});
      if(g.next<t.length)report('warning','키 제약의 추가 속성은 반영하지 않습니다.',t[g.next],table);return;
    }
    if(is(t[0],'FOREIGN')){const g=group(t,2),ref=g.next;if(!is(t[ref],'REFERENCES'))throw Error('REFERENCES가 필요합니다.');const n=nameAt(t,ref+1),parent=resolve(n),p=t[n.next]?.value==='('?group(t,n.next):null;
      const on=t.findIndex((v,i)=>is(v,'ON')&&is(t[i+1],'DELETE')),onDelete=on<0?'NO ACTION':t.slice(on+2,on+4).map(v=>v.value).join(' ').replace(/^CASCADE.*$/,'CASCADE').replace(/^RESTRICT.*$/,'RESTRICT');
      const from=columnNames(g.body),to=p?columnNames(p.body):[];if(from.some(n=>!table.columns.some(c=>c.name===n)))throw Error('FK 컬럼을 찾을 수 없습니다.');
      table.foreignKeys.push({from,to,parent,onDelete:['NO ACTION','CASCADE','RESTRICT','SET NULL'].includes(onDelete)?onDelete:'NO ACTION'});
      if(from.length>1)report('warning','복합 FK는 미리보기만 제공하며 관계선으로 가져오지 않습니다.',t[0],table);return;
    }
    report('warning',`지원하지 않는 제약은 제외합니다: ${raw(t).slice(0,100)}`,t[0],table);
  }
  function addColumn(table,t){const n=nameAt(t),name=n.name;if(n.parts.length!==1)throw Error('컬럼명에는 스키마를 지정할 수 없습니다.');if(table.columns.some(c=>c.name===name))throw Error(`중복 컬럼: ${name}`);
    const clauses=['NOT','NULL','DEFAULT','WITH','GENERATED','PRIMARY','UNIQUE','REFERENCES','CONSTRAINT','CHECK','COMPRESS','INLINE','IMPLICITLY'];let end=n.next,depth=0;
    for(;end<t.length;end++){const token=t[end];if(token.value==='('&&token.kind==='symbol')depth++;if(token.value===')'&&token.kind==='symbol')depth--;if(!depth&&token.kind==='word'&&clauses.includes(token.value))break;}
    const type=raw(t.slice(n.next,end)).toUpperCase();if(!type)throw Error(`${name}: 타입이 없습니다.`);const c={name,type,logical:'',pk:false,ai:false,nullable:true,unique:false,default:''};table.columns.push(c);let i=end;
    while(i<t.length){
      if(is(t[i],'NOT')&&is(t[i+1],'NULL')){c.nullable=false;i+=2;}
      else if(is(t[i],'NULL')){c.nullable=true;i++;}
      else if(is(t[i],'PRIMARY')&&is(t[i+1],'KEY')){c.pk=true;c.nullable=false;i+=2;}
      else if(is(t[i],'UNIQUE')){c.unique=true;i++;}
      else if(is(t[i],'CONSTRAINT')){i+=2;}
      else if(is(t[i],'DEFAULT')||is(t[i],'WITH')&&is(t[i+1],'DEFAULT')){if(is(t[i],'WITH'))i++;const begin=++i;let depth=0;while(i<t.length){if(t[i].value==='('&&t[i].kind==='symbol')depth++;if(t[i].value===')'&&t[i].kind==='symbol')depth--;if(!depth&&['NOT','GENERATED','PRIMARY','UNIQUE','REFERENCES','CHECK','CONSTRAINT'].some(w=>is(t[i],w)))break;i++;}c.default=raw(t.slice(begin,i));if(!c.default)report('warning',`${name}: 값 없는 DEFAULT는 출력에 반영하지 않습니다.`,t[begin-1],table);}
      else if(is(t[i],'GENERATED')){const begin=i;while(i<t.length&&!is(t[i],'AS'))i++;if(!is(t[i+1],'IDENTITY'))throw Error(`${name}: 계산식·행 변경 타임스탬프 GENERATED는 지원하지 않습니다.`);c.ai=true;c.nullable=false;c.identityMode=is(t[begin+1],'ALWAYS')?'ALWAYS':'BY DEFAULT';i+=2;if(t[i]?.value==='('){const g=group(t,i);c.identityOptions=raw(g.body);i=g.next;}}
      else if(is(t[i],'REFERENCES')){const n=nameAt(t,i+1),p=t[n.next]?.value==='('?group(t,n.next):null;table.foreignKeys.push({from:[name],parent:resolve(n),to:p?columnNames(p.body):[],onDelete:'NO ACTION'});i=p?.next||n.next;if(is(t[i],'ON')&&is(t[i+1],'DELETE')){const mode=t.slice(i+2,i+4).map(v=>v.value).join(' ');table.foreignKeys.at(-1).onDelete=mode.startsWith('CASCADE')?'CASCADE':mode.startsWith('RESTRICT')?'RESTRICT':mode==='SET NULL'?'SET NULL':'NO ACTION';i+=mode.startsWith('CASCADE')||mode.startsWith('RESTRICT')?3:4;}}
      else {report('warning',`${name}: 미지원 컬럼 속성 제외: ${raw(t.slice(i)).slice(0,100)}`,t[i],table);break;}
    }
  }
  for(const statement of statements){const first=statement[0];try{
    if(is(first,'SET')&&(is(statement[1],'SCHEMA')||is(statement[1],'CURRENT')&&is(statement[2],'SCHEMA'))){let i=is(statement[1],'CURRENT')?3:2;if(statement[i]?.value==='=')i++;currentSchema=statement[i]?.value||'';continue;}
    if(is(first,'CREATE')&&is(statement[1],'TABLE')){const n=nameAt(statement,2),identity=resolve(n),table={...identity,key:key(identity),columns:[],indexes:[],foreignKeys:[],logical:'',line:first.line,valid:true};if(find(identity))throw Error(`중복 CREATE TABLE: ${ddlTableLabel(identity)}`);tables.push(table);
      try{const g=group(statement,n.next),constraints=[];for(const part of split(g.body)){if(['CONSTRAINT','PRIMARY','FOREIGN','UNIQUE','CHECK','PERIOD'].some(w=>is(part[0],w)))constraints.push(part);else addColumn(table,part);}for(const part of constraints)constraint(table,part);if(!table.columns.length)throw Error('컬럼이 없습니다.');if(g.next<statement.length)report('warning','테이블스페이스·파티션 등 물리 저장 속성은 가져오지 않습니다.',statement[g.next],table);}
      catch(e){table.valid=false;report('error',e.message,first,table);}continue;
    }
    if(is(first,'ALTER')&&is(statement[1],'TABLE')||is(first,'COMMENT')||is(first,'CREATE')&&(is(statement[1],'INDEX')||is(statement[1],'UNIQUE')&&is(statement[2],'INDEX'))){later.push({statement,schema:currentSchema});continue;}
    report('warning',`실행하지 않고 건너뜁니다: ${raw(statement).slice(0,100)}`,first);
  }catch(e){report('error',e.message,first);}}
  for(const {statement:t,schema} of later){currentSchema=schema;let table,snapshot;try{
    if(is(t[0],'COMMENT')){if(!is(t[1],'ON'))throw Error('COMMENT ON 구문을 확인하세요.');const n=nameAt(t,3),column=is(t[2],'COLUMN');const identity=column?{name:n.parts.at(-2),schema:n.parts.slice(0,-2).join('.')||currentSchema}:resolve(n);table=find(identity);if(!table)throw Error(`COMMENT 대상 CREATE TABLE 없음: ${ddlTableLabel(identity)}`);if(!is(t[n.next],'IS')||t[n.next+1]?.kind!=='string')throw Error('COMMENT 문자열을 확인하세요.');if(column){const c=table.columns.find(c=>c.name===n.name);if(!c)throw Error('COMMENT 대상 컬럼 없음');c.logical=t[n.next+1].value;}else if(is(t[2],'TABLE'))table.logical=t[n.next+1].value;else throw Error('TABLE/COLUMN COMMENT만 지원합니다.');
    }else if(is(t[0],'ALTER')){const n=nameAt(t,2);table=find(resolve(n));if(!table)throw Error('ALTER 대상의 CREATE TABLE이 입력 SQL에 없습니다.');snapshot=structuredClone(table);let i=n.next;if(is(t[i],'ADD')){i++;if(is(t[i],'COLUMN'))i++;if(['CONSTRAINT','PRIMARY','UNIQUE','FOREIGN','CHECK'].some(w=>is(t[i],w)))constraint(table,t.slice(i));else addColumn(table,t.slice(i));}
      else if(is(t[i],'ALTER')){i++;if(is(t[i],'COLUMN'))i++;const cn=nameAt(t,i),c=table.columns.find(c=>c.name===cn.name);if(!c)throw Error('ALTER 대상 컬럼 없음');i=cn.next;if(is(t[i],'SET')&&is(t[i+1],'NOT')&&is(t[i+2],'NULL'))c.nullable=false;else if(is(t[i],'DROP')&&is(t[i+1],'NOT')&&is(t[i+2],'NULL'))c.nullable=true;else if(is(t[i],'SET')&&is(t[i+1],'DEFAULT'))c.default=raw(t.slice(i+2));else if(is(t[i],'DROP')&&is(t[i+1],'DEFAULT'))c.default='';else if(is(t[i],'SET')&&is(t[i+1],'DATA')&&is(t[i+2],'TYPE'))c.type=raw(t.slice(i+3)).toUpperCase();else throw Error('지원하지 않는 ALTER COLUMN 구문입니다.');}
      else throw Error('ADD / ALTER COLUMN 이외의 ALTER TABLE은 지원하지 않습니다.');
    }else{const unique=is(t[1],'UNIQUE'),index=nameAt(t,unique?3:2);if(!is(t[index.next],'ON'))throw Error('INDEX ON 구문을 확인하세요.');const n=nameAt(t,index.next+1);table=find(resolve(n));if(!table)throw Error('INDEX 대상 CREATE TABLE이 없습니다.');const g=group(t,n.next),cols=split(g.body).map(part=>{const c=nameAt(part);if(c.next<part.length&&!is(part[c.next],'ASC'))throw Error('표현식·DESC 인덱스는 가져오지 않습니다.');if(!table.columns.some(v=>v.name===c.name))throw Error('INDEX 컬럼 없음');return c.name;});table.indexes.push({name:index.name,schema:index.schema,columns:cols,unique});if(g.next<t.length)report('warning','인덱스의 추가 물리 속성은 제외합니다.',t[g.next],table);}
  }catch(e){if(snapshot)Object.assign(table,snapshot);report('warning',e.message,t[0],table);}}
  if(tables.length>500||tables.reduce((n,t)=>n+t.columns.length,0)>10000)throw Error('한 번에 테이블 500개·컬럼 10000개까지 분석할 수 있습니다.');
  return {tables,diagnostics,statementCount:statements.length};
}

export function planDb2Import(document,analysis,choices,options={}) {
  const o={schemaMode:'keep',logicalSource:'comments',linkTerms:true,removeMissing:false,importRelations:true,layout:'relations',...options};
  const dictionary=effectiveDictionary(document),next=structuredClone(document),warnings=[],changes=[],mapping=new Map(),newTables=[],skipped=new Set();const normalize=s=>String(s||'').trim().toLowerCase();
  const identity=t=>JSON.stringify([normalize(o.schemaMode==='keep'?t.schema:''),normalize(t.name)]);
  const prepared=analysis.tables.filter(t=>t.valid&&choices[t.key]?.selected);
  if(!prepared.length)throw Error('가져올 테이블을 선택하세요.');
  const reserved=new Set();
  for(const source of prepared){const choice=choices[source.key],schema=o.schemaMode==='keep'?source.schema:'',name=choice.mode==='rename'?choice.rename.trim():source.name;if(!name)throw Error('변경할 테이블 이름을 입력하세요.');
    const destinationKey=identity({name,schema});if(reserved.has(destinationKey))throw Error(`가져올 테이블 이름이 중복됩니다: ${name}`);reserved.add(destinationKey);
    const match=next.tables.find(t=>identity(t)===identity({name,schema}));if(match&&choice.mode==='skip'){changes.push({name:ddlTableLabel(source),action:'건너뛰기',columns:[]});mapping.set(source.key,match);skipped.add(source.key);continue;}
    if(match&&choice.mode!=='update')throw Error(`이미 존재하는 테이블: ${[schema,name].filter(Boolean).join('.')}`);
    const table=match||{...newTable(),name,schema,columns:[],indexes:[]};const oldColumns=table.columns,oldIndexes=table.indexes;const columnChanges=[];
    table.schema=schema;table.name=name;table.logical=source.logical||table.logical||source.name;
    table.columns=source.columns.map(c=>{const old=oldColumns.find(v=>normalize(v.name)===normalize(c.name)),term=dictionary.terms.find(t=>normalize(t.physical)===normalize(c.name)&&normalizeType(termType(t,dictionary.types))===normalizeType(c.type));
      const logical=o.logicalSource==='dictionary'?term?.logical||c.logical||old?.logical||c.name:c.logical||term?.logical||old?.logical||c.name;
      let termId='';if(o.linkTerms&&term&&term.physical===c.name&&(!c.logical||logical===term.logical)){termId=term.id;}else if(o.linkTerms&&term&&c.logical)warnings.push(`${name}.${c.name}: SQL 주석을 유지하기 위해 사전 자동 연결을 생략했습니다.`);
      const imported={...column(c.name,logical,c.type),...c,id:old?.id||uid(),logical,termId};
      columnChanges.push({name:c.name,action:!old?'추가':['type','pk','nullable','ai','default','unique','logical','termId','identityMode','identityOptions'].some(k=>(old[k]??'')!==(imported[k]??''))?'변경':'유지'});return imported;});
    for(const c of oldColumns.filter(c=>!table.columns.some(v=>v.id===c.id))){columnChanges.push({name:c.name,action:o.removeMissing?'삭제':'기존 유지'});if(!o.removeMissing)table.columns.push(c);}
    const ids=new Set(table.columns.map(c=>c.id));table.indexes=oldIndexes.filter(ix=>{const valid=ix.columns.every(id=>ids.has(id));if(!valid)warnings.push(`${name}: 삭제 컬럼을 참조하는 인덱스 ${ix.name}을 제외합니다.`);return valid;});
    for(const ix of source.indexes){const imported={...ix,id:oldIndexes.find(v=>normalize(v.name)===normalize(ix.name))?.id||uid(),columns:ix.columns.map(n=>table.columns.find(c=>c.name===n)?.id)};if(imported.columns.some(id=>!id)){warnings.push(`${name}: 인덱스 ${ix.name}의 컬럼을 찾지 못했습니다.`);continue;}table.indexes=table.indexes.filter(v=>normalize(v.name)!==normalize(ix.name));table.indexes.push(imported);}
    if(!match){next.tables.push(table);newTables.push(table);}mapping.set(source.key,table);changes.push({name:ddlTableLabel({name,schema}),action:match?'갱신':'추가',columns:columnChanges});
  }
  const columnIds=new Set(next.tables.flatMap(t=>t.columns.map(c=>c.id)));const before=next.relations.length;next.relations=next.relations.filter(r=>columnIds.has(r.sourceColumn)&&columnIds.has(r.targetColumn));if(before!==next.relations.length)warnings.push(`삭제 컬럼을 참조하는 관계 ${before-next.relations.length}개를 제거합니다.`);
  if(o.importRelations)for(const source of prepared){if(skipped.has(source.key))continue;const child=mapping.get(source.key);for(const fk of source.foreignKeys){if(fk.from.length!==1)continue;const parent=mapping.get(key(fk.parent))||next.tables.find(t=>identity(t)===identity(fk.parent));const pc=parent?.columns.find(c=>fk.to.length?c.name===fk.to[0]:c.pk),cc=child.columns.find(c=>c.name===fk.from[0]);if(!pc||!cc){warnings.push(`${ddlTableLabel(child)}: FK ${fk.from.join(',')}의 부모 테이블/컬럼을 찾지 못해 제외합니다.`);continue;}
      next.relations=next.relations.filter(r=>r.targetColumn!==cc.id);next.relations.push({id:uid(),source:parent.id,sourceColumn:pc.id,target:child.id,targetColumn:cc.id,cardinality:'1:N',identifying:cc.pk,onDelete:fk.onDelete});}}
  const baseY=document.tables.length?Math.max(...document.tables.map(t=>t.position.y+180+t.columns.length*32))+120:80;
  const level=new Map();function depth(table,path=new Set()){if(level.has(table.id))return level.get(table.id);if(path.has(table.id))return 0;const p=new Set([...path,table.id]),parents=next.relations.filter(r=>r.target===table.id&&newTables.some(t=>t.id===r.source));const value=parents.length?Math.min(4,1+Math.max(...parents.map(r=>depth(newTables.find(t=>t.id===r.source),p)))):0;level.set(table.id,value);return value;}
  const offsets=new Map();newTables.forEach((t,i)=>{const x=o.layout==='relations'?depth(t):i%2,y=offsets.get(x)||baseY;t.position={x:80+x*850,y};offsets.set(x,y+180+t.columns.length*32);});
  synchronize(next);validate(next);return {document:next,changes,warnings,added:newTables.length,updated:changes.filter(c=>c.action==='갱신').length};
}
