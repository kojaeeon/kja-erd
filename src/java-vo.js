const keywords=new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _ record sealed permits var yield').split(' '));
const identifier=/^[\p{L}_$][\p{L}\p{N}_$]*$/u;
export function javaName(value,style='camel') {
  const source=String(value).trim();
  const words=source.replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([a-z0-9])([A-Z])/g,'$1 $2').split(/[^\p{L}\p{N}$]+/u).filter(Boolean).map(w=>w.toLowerCase());
  const cap=w=>w.charAt(0).toUpperCase()+w.slice(1);
  let name=style==='original'?source.replace(/[^\p{L}\p{N}_$]/gu,'_'):style==='upper'?words.join('_').toUpperCase():style==='lower'?words.join('_'):style==='pascal'?words.map(cap).join(''):style==='snake'?words.join('_'):words.map((w,i)=>i?cap(w):w).join('');
  if(!name)name='field';if(!/^[\p{L}_$]/u.test(name))name='_'+name;if(keywords.has(name))name+='_';return name;
}
export function javaType(sqlType,{boxed=true,dates='modern'}={}) {
  const base=sqlType.trim().toUpperCase().match(/^[A-Z]+(?:\s+PRECISION)?/)?.[0];
  const types={SMALLINT:'Short',TINYINT:'Byte',INT:'Integer',INTEGER:'Integer',BIGINT:'Long',REAL:'Float',FLOAT:'Double',DOUBLE:'Double','DOUBLE PRECISION':'Double',BOOLEAN:'Boolean',BOOL:'Boolean',DECIMAL:'BigDecimal',NUMERIC:'BigDecimal',DECFLOAT:'BigDecimal',BLOB:'byte[]',BINARY:'byte[]',VARBINARY:'byte[]',DATE:dates==='modern'?'LocalDate':'Date',TIME:dates==='modern'?'LocalTime':'Time',TIMESTAMP:dates==='modern'?'LocalDateTime':'Timestamp',DATETIME:dates==='modern'?'LocalDateTime':'Timestamp'};
  const mapped=types[base]||'String';const primitives={Short:'short',Byte:'byte',Integer:'int',Long:'long',Float:'float',Double:'double',Boolean:'boolean'};return boxed?mapped:primitives[mapped]||mapped;
}
export function generateJavaVo(table,options={}) {
  const o={style:'camel',className:javaName(table.name,'pascal')+'VO',packageName:'',prefix:'',boxed:true,dates:'modern',accessors:'plain',comments:true,serializable:false,...options};
  if(!identifier.test(o.className)||keywords.has(o.className))throw Error('클래스명은 유효한 Java 식별자로 입력하세요.');
  if(o.packageName&&!o.packageName.split('.').every(v=>identifier.test(v)&&!keywords.has(v)))throw Error('패키지명은 com.example.vo처럼 입력하세요.');
  const fields=table.columns.map(c=>({column:c,name:javaName(o.prefix&&c.name.startsWith(o.prefix)?c.name.slice(o.prefix.length):c.name,o.style),type:javaType(c.type,o)}));
  const seen=new Set(o.serializable?['serialVersionUID']:[]);for(const f of fields){if(seen.has(f.name))throw Error(`이름 변환 후 ${f.name} 필드가 중복됩니다. 접두어 또는 이름 변환 옵션을 변경하세요.`);seen.add(f.name);}
  // Getter names must also be unique; getClass() is final in Object.
  const method=f=>'get'+f.name.charAt(0).toUpperCase()+f.name.slice(1);const methods=new Set();
  if(o.accessors!=='none')for(const f of fields){if(method(f)==='getClass'||methods.has(method(f)))throw Error(`${f.name}의 getter 이름이 충돌합니다. 이름 변환 옵션을 변경하세요.`);methods.add(method(f));}
  const imports=new Set();const mappings={BigDecimal:'java.math.BigDecimal',LocalDate:'java.time.LocalDate',LocalTime:'java.time.LocalTime',LocalDateTime:'java.time.LocalDateTime',Date:'java.sql.Date',Time:'java.sql.Time',Timestamp:'java.sql.Timestamp'};
  fields.forEach(f=>{if(mappings[f.type])imports.add(mappings[f.type]);});if(o.serializable)imports.add('java.io.Serializable');if(o.accessors==='lombok'){imports.add('lombok.Getter');imports.add('lombok.Setter');}
  const comment=s=>String(s||'').replaceAll('\\','/').replaceAll('*/','* /').replace(/[\r\n]+/g,' ');
  const lines=[];if(o.packageName)lines.push(`package ${o.packageName};`,'');if(imports.size)lines.push(...[...imports].sort().map(i=>`import ${i};`),'');
  if(o.comments)lines.push(`/** ${comment(table.logical||table.name)} (${comment(table.name)}) */`);if(o.accessors==='lombok')lines.push('@Getter','@Setter');lines.push(`public class ${o.className}${o.serializable?' implements Serializable':''} {`);
  if(o.serializable)lines.push('    private static final long serialVersionUID = 1L;','');
  for(const f of fields){if(o.comments)lines.push(`    /** ${comment(f.column.logical||f.column.name)} · ${comment(f.column.name)} · ${comment(f.column.type)}${f.column.pk?' · PK':''}${f.column.nullable?' · NULL 허용':''} */`);lines.push(`    private ${f.type} ${f.name};`,'');}
  if(o.accessors==='plain')for(const f of fields){const suffix=f.name.charAt(0).toUpperCase()+f.name.slice(1);lines.push(`    public ${f.type} get${suffix}() {`,`        return ${f.name};`,'    }','',`    public void set${suffix}(${f.type} ${f.name}) {`,`        this.${f.name} = ${f.name};`,'    }','');}
  lines.push('}');return {text:lines.join('\n')+'\n',fields,className:o.className};
}
