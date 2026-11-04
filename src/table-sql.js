import {tableSqlName} from './model.js';
// Local, deterministic sample data. These helpers only produce SQL; they never execute it.
export const quoteName=(name,dialect)=>dialect==='mysql'?'`'+name.replaceAll('`','``')+'`':'"'+name.replaceAll('"','""')+'"';
export const quoteText=value=>"'"+String(value).replaceAll("'","''")+"'";
export const sqlType=(type,dialect)=>dialect==='db2'?type.trim().toUpperCase().replace(/^TEXT$/,'CLOB').replace(/^DATETIME$/,'TIMESTAMP').replace(/^INT$/,'INTEGER').replace(/^NUMERIC/,'DECIMAL'):type;
export const typeInfo=column=>{const type=column.type.trim().toUpperCase();const base=type.match(/^[A-Z]+(?:\s+PRECISION)?/)?.[0]||type;const sizes=type.match(/\((\d+)(?:\s*,\s*(\d+))?\)/);return {base,length:sizes?Number(sizes[1]):null,scale:sizes?.[2]?Number(sizes[2]):0};};
const integerTypes=['SMALLINT','INTEGER','INT','BIGINT','TINYINT'];
const numberTypes=[...integerTypes,'DECIMAL','NUMERIC','REAL','FLOAT','DOUBLE','DOUBLE PRECISION','DECFLOAT'];
const textTypes=['CHAR','VARCHAR','NCHAR','NVARCHAR','GRAPHIC','VARGRAPHIC','TEXT','CLOB','DBCLOB'];
export const defaultValue={sqlDefault:true};
export function sampleValue(column,sequence) {
  const {base,length,scale}=typeInfo(column);
  if(integerTypes.includes(base))return String(sequence);
  if(['DECIMAL','NUMERIC'].includes(base)) {const digits=String(sequence).padStart(scale+1,'0');return scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits;}
  if(numberTypes.includes(base))return String(sequence);
  if(['BOOLEAN','BOOL'].includes(base))return sequence%2===1;
  const day=new Date(Date.UTC(2020,0,1)+((sequence-1)%36525)*86400000).toISOString().slice(0,10);
  if(base==='DATE')return day;
  if(['DATETIME','TIMESTAMP'].includes(base))return day+' 12:00:00';
  if(base==='TIME')return '12:00:00';
  if(['BLOB','BINARY','VARBINARY'].includes(base))return sequence.toString(16).padStart(2,'0').replace(/^(.*)$/,v=>v.length%2?'0'+v:v);
  if(base==='XML')return `<sample id="${sequence}"/>`;
  if(textTypes.includes(base)) {
    const suffix=sequence.toString(36),prefix=column.name.replace(/[^a-zA-Z0-9_]/g,'').slice(0,20)||'sample';
    return length?prefix.slice(0,Math.max(0,length-suffix.length-1))+(length>suffix.length?'_':'')+suffix.slice(-length):`${prefix}_${suffix}`;
  }
  throw Error(`${column.name}: 자동 생성이 지원되지 않는 타입입니다 (${column.type}).`);
}
export function valueSql(column,value,dialect) {
  const {base,length,scale}=typeInfo(column),label=column.name;
  if(value?.sqlDefault){if(!column.default&&!column.nullable&&!column.ai)throw Error(`${label}: DEFAULT 값이 없는 NOT NULL 컬럼입니다.`);return 'DEFAULT';}
  if(value==null){if(column.pk||!column.nullable)throw Error(`${label}: NULL을 허용하지 않습니다.`);return 'NULL';}
  if(numberTypes.includes(base)) {
    const text=String(value).trim();
    if(!/^[+-]?\d+(?:\.\d+)?$/.test(text))throw Error(`${label}: 숫자를 입력하세요.`);
    if(integerTypes.includes(base)) {
      if(text.includes('.'))throw Error(`${label}: 정수가 필요합니다.`);
      const n=BigInt(text),bits=base==='BIGINT'?64:base==='SMALLINT'?16:base==='TINYINT'?8:32;
      if(n<-(1n<<BigInt(bits-1))||n>(1n<<BigInt(bits-1))-1n)throw Error(`${label}: ${base} 범위를 초과했습니다.`);
    }
    if(['DECIMAL','NUMERIC'].includes(base)&&length!=null){const parts=text.replace(/^[+-]/,'').split('.');const integers=parts[0].replace(/^0+/,'').length;if(integers>length-scale||(parts[1]?.length||0)>scale)throw Error(`${label}: ${column.type} 자리수를 초과했습니다.`);}
    return text;
  }
  if(['BOOLEAN','BOOL'].includes(base)){const text=String(value).toLowerCase();if(!['true','false','1','0'].includes(text))throw Error(`${label}: TRUE/FALSE 또는 1/0을 입력하세요.`);const yes=['true','1'].includes(text);return dialect==='sqlite'||dialect==='mysql'?(yes?'1':'0'):(yes?'TRUE':'FALSE');}
  const text=String(value);
  if(textTypes.includes(base)){if(length!=null&&Array.from(text).length>length)throw Error(`${label}: 문자열 길이가 ${length}자를 초과했습니다.`);return quoteText(text);}
  if(['BLOB','BINARY','VARBINARY'].includes(base)){if(!/^(?:[a-fA-F0-9]{2})*$/.test(text))throw Error(`${label}: 짝수 자리의 16진수를 입력하세요.`);return dialect==='postgres'?`decode(${quoteText(text)}, 'hex')`:`X'${text}'`;}
  if(['DATE','TIME','TIMESTAMP','DATETIME'].includes(base)) {
    const pattern=base==='DATE'?/^\d{4}-\d{2}-\d{2}$/:base==='TIME'?/^\d{2}:\d{2}:\d{2}$/:/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,12})?$/;
    if(!pattern.test(text))throw Error(`${label}: 날짜는 YYYY-MM-DD, 일시는 YYYY-MM-DD HH:mm:ss 형식으로 입력하세요.`);
    if(base!=='TIME'){const date=text.slice(0,10);const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error(`${label}: 유효하지 않은 날짜입니다.`);}
    const time=base==='TIME'?text:text.slice(11);if(base!=='DATE'&&(Number(time.slice(0,2))>23||Number(time.slice(3,5))>59||Number(time.slice(6,8))>59))throw Error(`${label}: 유효하지 않은 시간입니다.`);
    return dialect==='db2'?`${base==='DATETIME'?'TIMESTAMP':base}(${quoteText(text.replace('T',' '))})`:quoteText(text.replace('T',' '));
  }
  if(base==='XML')return dialect==='db2'?`XMLPARSE(DOCUMENT ${quoteText(text)})`:quoteText(text);
  throw Error(`${label}: INSERT 변환이 지원되지 않는 타입입니다 (${column.type}).`);
}
export function insertSql(document,table,columns,rows) {
  const q=name=>quoteName(name,document.dialect);const constraints=table.columns.filter(c=>c.pk||c.unique).map(c=>[c]);
  if(table.columns.some(c=>c.pk))constraints.push(table.columns.filter(c=>c.pk));
  constraints.push(...table.indexes.filter(ix=>ix.unique).map(ix=>ix.columns.map(id=>table.columns.find(c=>c.id===id)).filter(Boolean)));
  const seen=constraints.map(()=>new Set());
  const statements=rows.map((row,index)=>{
    let values;try{values=columns.map(c=>valueSql(c,row[c.id],document.dialect));}catch(e){throw Error(`${index+1}행: ${e.message}`);}
    // A composite PK is checked as a group, never as individual unique columns.
    constraints.forEach((keys,i)=>{if(!keys.length||keys.some(c=>!columns.includes(c)||row[c.id]==null||row[c.id]?.sqlDefault)||keys.length===1&&keys[0].pk&&table.columns.filter(c=>c.pk).length>1&&!keys[0].unique)return;
      const key=JSON.stringify(keys.map(c=>{const value=values[columns.indexOf(c)];if(!numberTypes.includes(typeInfo(c).base))return value;const parts=value.split('.');let coefficient=BigInt(parts.join('')),scale=parts[1]?.length||0;while(scale&&coefficient%10n===0n){coefficient/=10n;scale--;}return coefficient.toString()+'e-'+scale;}));if(seen[i].has(key))throw Error(`${index+1}행: ${keys.map(c=>c.name).join(', ')} 키 값이 중복됩니다.`);seen[i].add(key);});
    const included=columns.map((c,i)=>({column:c,value:values[i]})).filter(c=>c.value!=='DEFAULT');
    if(!included.length)return document.dialect==='mysql'?`INSERT INTO ${tableSqlName(table,q)} () VALUES ();`:document.dialect==='db2'?`INSERT INTO ${tableSqlName(table,q)} (${q(table.columns[0].name)}) VALUES (DEFAULT);`:`INSERT INTO ${tableSqlName(table,q)} DEFAULT VALUES;`;
    return `INSERT INTO ${tableSqlName(table,q)} (${included.map(c=>q(c.column.name)).join(', ')})\nVALUES (${included.map(c=>c.value).join(', ')});`;
  });
  return statements.join('\n\n');
}
export function generateTestData(document,tableId,{count=1000,start=1,includeIdentity=false,rules={}}={}) {
  const table=document.tables.find(t=>t.id===tableId);if(!table)throw Error('테이블을 찾을 수 없습니다.');
  count=Number(count);start=Number(start);
  if(!Number.isSafeInteger(count)||count<1||count>10000)throw Error('행 수는 1~10000 사이의 정수여야 합니다.');
  if(!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(start+count))throw Error('시작 번호는 유효한 양의 정수여야 합니다.');
  if(!table.columns.length)throw Error('컬럼이 없는 테이블입니다.');
  const columns=table.columns.filter(c=>includeIdentity||!c.ai);
  if(count*Math.max(1,columns.length)>100000)throw Error('한 번에 100000개 셀까지 생성할 수 있습니다.');
  const rows=Array.from({length:count},(_,i)=>Object.fromEntries(columns.map(c=>{const rule=rules[c.id]||{mode:'auto'};return [c.id,rule.mode==='null'?null:rule.mode==='default'?defaultValue:rule.mode==='fixed'?rule.value:sampleValue(c,start+i)];})));
  let text=insertSql(document,table,columns,rows);
  const foreignKeys=document.relations.filter(r=>r.target===table.id);
  const warnings=foreignKeys.length?['FK 컬럼의 값과 실제 부모 테이블의 키를 확인하세요. 부모 데이터는 자동 생성하지 않습니다.']:[];
  text=`-- ${table.name.replaceAll('\n',' ')} · ${document.dialect.toUpperCase()} · ${count}행 테스트 데이터\n`+(warnings.length?'-- '+warnings[0]+'\n':'')+'\n'+text;
  if(text.length>5000000)throw Error('생성 SQL이 너무 큽니다. 행 수를 줄이세요.');
  return {text,rows,columns,warnings};
}

export function favoriteSql(document,tableId) {
  const t=document.tables.find(t=>t.id===tableId);if(!t?.columns.length)throw Error('컬럼이 있는 테이블을 선택하세요.');
  const dialect=document.dialect,q=n=>quoteName(n,dialect),name=tableSqlName(t,q),cols=t.columns.map(c=>q(c.name)).join(', '),pk=t.columns.filter(c=>c.pk),nonKeys=t.columns.filter(c=>!c.pk&&!c.ai),write=t.columns.filter(c=>!c.ai);
  const val=c=>valueSql(c,sampleValue(c,1),dialect),where=pk.length?pk.map(c=>`${q(c.name)} = ${val(c)}`).join(' AND '):'1 = 0 /* PK가 없습니다. 조건을 지정하세요. */';
  const order=pk.length?pk:t.columns.filter(c=>!['CLOB','TEXT','BLOB','DBCLOB','XML'].includes(typeInfo(c).base)).slice(0,1);
  const sort=order.length?' ORDER BY '+order.map(c=>q(c.name)+' DESC').join(', '):'';
  const limit=(n,offset=0)=>dialect==='db2'?` OFFSET ${offset} ROWS FETCH NEXT ${n} ROWS ONLY`:` LIMIT ${n}${offset?' OFFSET '+offset:''}`;
  const snippets=[];const add=(id,title,text)=>snippets.push({id,title,text});
  const backup=tableSqlName({...t,name:t.name+'_backup'},q);
  add('backup','테이블 복사 / 백업',`-- 데이터 백업 (키·인덱스·IDENTITY 속성은 복사되지 않습니다)\nCREATE TABLE ${backup} ${dialect==='db2'?`AS (SELECT * FROM ${name}) WITH DATA`:`AS SELECT * FROM ${name}`};\n\n-- 백업에서 데이터 복사 (자동증가 컬럼 제외)\n${write.length?`INSERT INTO ${name} (${write.map(c=>q(c.name)).join(', ')})\nSELECT ${write.map(c=>q(c.name)).join(', ')} FROM ${backup};`:'-- 자동증가 컬럼만 있어 복사할 일반 컬럼이 없습니다.'}`);
  add('select','기본 SELECT',`-- 행 수\nSELECT COUNT(*) AS row_count FROM ${name};\n\n-- 조건 조회\nSELECT ${cols} FROM ${name} WHERE ${where};\n\n-- 역순 조회\nSELECT ${cols} FROM ${name}${sort};\n\n-- 100건 조회\nSELECT ${cols} FROM ${name}${sort}${limit(100)};`);
  add('paging','페이징 조회',`-- 첫 페이지: 10건, 다음 페이지는 OFFSET 10\nSELECT ${cols} FROM ${name}${sort}${limit(10)};`);
  const joins=[];
  for(const r of document.relations.filter(r=>r.source===t.id||r.target===t.id)) {
    const other=document.tables.find(v=>v.id===(r.source===t.id?r.target:r.source));if(!other)continue;
    const own=t.columns.find(c=>c.id===(r.source===t.id?r.sourceColumn:r.targetColumn)),remote=other.columns.find(c=>c.id===(r.source===t.id?r.targetColumn:r.sourceColumn));if(!own||!remote)continue;
    const select=[...t.columns.map(c=>`a.${q(c.name)} AS ${q('a_'+c.name)}`),...other.columns.map(c=>`b.${q(c.name)} AS ${q('b_'+c.name)}`)].join(', ');
    for(const kind of ['INNER JOIN','LEFT OUTER JOIN'])joins.push(`-- ${other.name.replaceAll('\n',' ')} ${kind}\nSELECT ${select}\nFROM ${name} a ${kind} ${tableSqlName(other,q)} b\nON a.${q(own.name)} = b.${q(remote.name)}${limit(100)};`);
    if(r.source===t.id){
      joins.push(`-- 부모별 자식 행 수\nSELECT a.*, b.row_count\nFROM ${name} a LEFT JOIN (SELECT ${q(remote.name)}, COUNT(*) AS row_count FROM ${tableSqlName(other,q)} GROUP BY ${q(remote.name)}) b\nON a.${q(own.name)} = b.${q(remote.name)};`);
      const childPk=other.columns.filter(c=>c.pk);if(childPk.length)joins.push(`-- 부모별 마지막 자식 행 (PK 역순)\nSELECT a.*, b.* FROM ${name} a\nLEFT JOIN (SELECT x.*, ROW_NUMBER() OVER (PARTITION BY ${q(remote.name)} ORDER BY ${childPk.map(c=>q(c.name)+' DESC').join(', ')}) AS row_num FROM ${tableSqlName(other,q)} x) b\nON a.${q(own.name)} = b.${q(remote.name)} AND b.row_num = 1;`);
    }
  }
  add('join','JOIN 조회',joins.join('\n\n')||'-- 연결된 테이블 관계가 없습니다. ERD 관계를 추가하면 JOIN 예시가 생성됩니다.');
  const date=t.columns.find(c=>['DATE','DATETIME','TIMESTAMP'].includes(typeInfo(c).base)),text=t.columns.find(c=>['CHAR','VARCHAR','NCHAR','NVARCHAR','GRAPHIC','VARGRAPHIC'].includes(typeInfo(c).base)),num=t.columns.find(c=>numberTypes.includes(typeInfo(c).base)&&!c.pk);
  const analysis=[];
  if(text){analysis.push(`SELECT DISTINCT ${q(text.name)} FROM ${name};`);const concat=s=>dialect==='mysql'?`CONCAT(${q(text.name)}, ${quoteText(s)})`:`${q(text.name)} || ${quoteText(s)}`;analysis.push(`SELECT CASE WHEN ${q(text.name)} = 'A' THEN ${concat('_A')} ELSE ${concat('_OTHER')} END AS label FROM ${name};`);}
  if(text&&num)analysis.push(`SELECT ${q(text.name)}, AVG(${q(num.name)}) AS average_value FROM ${name}\nGROUP BY ${q(text.name)} HAVING AVG(${q(num.name)}) > 50;`);
  if(date){const day=dialect==='postgres'?`CAST(${q(date.name)} AS DATE)`:`DATE(${q(date.name)})`;analysis.push(`SELECT ${cols} FROM ${name}\nWHERE ${q(date.name)} >= '2020-01-01' AND ${q(date.name)} < '2021-01-01';`,`SELECT ${day} AS stat_date, COUNT(*) AS row_count FROM ${name}\nGROUP BY ${day} ORDER BY stat_date DESC;`);}
  add('analysis','DISTINCT / CASE / GROUP BY / 날짜 통계',analysis.join('\n\n')||'-- 문자열·숫자·날짜 컬럼을 추가하면 해당 예시가 생성됩니다.');
  const row=Object.fromEntries(write.map(c=>[c.id,sampleValue(c,1)]));
  let insert=insertSql(document,t,write,[row]);if(dialect==='db2'&&t.columns.some(c=>c.ai))insert+='\nVALUES IDENTITY_VAL_LOCAL();';if(dialect==='sqlite'&&t.columns.some(c=>c.ai))insert+='\nSELECT last_insert_rowid();';if(dialect==='mysql'&&t.columns.some(c=>c.ai))insert+='\nSELECT LAST_INSERT_ID();';
  add('insert','INSERT / 자동증가 값 조회',insert);
  add('update','UPDATE / DELETE',`${nonKeys.length?`UPDATE ${name}\nSET ${nonKeys.map(c=>`${q(c.name)} = ${val(c)}`).join(', ')}\nWHERE ${where};`:'-- 변경할 일반 컬럼이 없습니다.'}\n\nDELETE FROM ${name} WHERE ${where};`+(date?`\n\n-- 하루 이전 데이터 삭제\nDELETE FROM ${name} WHERE ${q(date.name)} < ${dialect==='db2'?'CURRENT TIMESTAMP - 1 DAY':dialect==='postgres'?"CURRENT_TIMESTAMP - INTERVAL '1 day'":dialect==='mysql'?'DATE_SUB(NOW(), INTERVAL 1 DAY)':"datetime('now', '-1 day')"};`:''));
  let upsert='-- PK가 없습니다. UPSERT를 생성하려면 PK를 지정하세요.';
  if(pk.length){
    if(dialect==='db2')upsert=`MERGE INTO ${name} AS t\nUSING (VALUES (${t.columns.map(c=>`CAST(${val(c)} AS ${sqlType(c.type,dialect)})`).join(', ')})) AS s (${cols})\nON ${pk.map(c=>`t.${q(c.name)} = s.${q(c.name)}`).join(' AND ')}\n${nonKeys.length?'WHEN MATCHED THEN UPDATE SET '+nonKeys.map(c=>`${q(c.name)} = s.${q(c.name)}`).join(', ')+'\n':''}WHEN NOT MATCHED THEN INSERT (${cols})\nVALUES (${t.columns.map(c=>'s.'+q(c.name)).join(', ')});`;
    else {const allrow=Object.fromEntries(t.columns.map(c=>[c.id,sampleValue(c,1)]));const base=insertSql(document,t,t.columns,[allrow]).replace(/;$/,'');upsert=base+(dialect==='mysql'?`\nON DUPLICATE KEY UPDATE ${nonKeys.length?nonKeys.map(c=>`${q(c.name)} = VALUES(${q(c.name)})`).join(', '):`${q(pk[0].name)} = ${q(pk[0].name)}`};`:`\nON CONFLICT (${pk.map(c=>q(c.name)).join(', ')}) ${nonKeys.length?'DO UPDATE SET '+nonKeys.map(c=>`${q(c.name)} = excluded.${q(c.name)}`).join(', '):'DO NOTHING'};`);}
  }
  add('upsert',dialect==='db2'?'MERGE · 없으면 INSERT / 있으면 UPDATE':'UPSERT · 없으면 INSERT / 있으면 UPDATE',upsert);
  return snippets;
}
