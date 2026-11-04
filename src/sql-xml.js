import {tableSqlName} from './model.js';
import {generateJavaVo,javaName,javaType} from './java-vo.js';
import {quoteName,typeInfo} from './table-sql.js';
export const xmlEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export const xmlTextEscape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function jdbcType(type) {
  const base=typeInfo({type}).base;
  return ({INT:'INTEGER',DATETIME:'TIMESTAMP',TEXT:'CLOB',NUMERIC:'NUMERIC',DECFLOAT:'DECIMAL',BOOL:'BOOLEAN',DOUBLE:'DOUBLE','DOUBLE PRECISION':'DOUBLE',GRAPHIC:'CHAR',VARGRAPHIC:'VARCHAR',DBCLOB:'CLOB',XML:'SQLXML'})[base]||(['SMALLINT','TINYINT','INTEGER','BIGINT','REAL','FLOAT','BOOLEAN','DECIMAL','CHAR','VARCHAR','NCHAR','NVARCHAR','CLOB','BLOB','BINARY','VARBINARY','DATE','TIME','TIMESTAMP'].includes(base)?base:'VARCHAR');
}
export function generateSqlXml(doc,tableId,options={}) {
  const table=doc.tables.find(t=>t.id===tableId);if(!table?.columns.length)throw Error('컬럼이 있는 테이블을 선택하세요.');
  const className=javaName(table.name,'pascal'),o={namespace:`com.example.mapper.${className}Mapper`,voType:`com.example.vo.${className}VO`,style:'camel',prefix:'',jdbc:true,skipIdentity:true,skipDefaults:false,updateNulls:false,keyMode:'none',comments:true,select:true,insert:true,update:true,delete:true,...options};
  // Share VO validation and name conversion so mapper properties match generated Java fields.
  for(const [label,value] of [['네임스페이스',o.namespace],['VO 타입',o.voType]]){
    const parts=value.split('.');try{generateJavaVo({name:'check',columns:[]},{className:parts.pop(),packageName:parts.join('.')});}catch{throw Error(`${label}은 유효한 Java 클래스 경로로 입력하세요.`);}
  }
  const fields=generateJavaVo(table,{style:o.style,prefix:o.prefix}).fields;
  if(fields.some(f=>!/^[_\p{L}][\p{L}\p{N}_]*$/u.test(f.name)))throw Error('MyBatis 필드명은 문자·숫자·밑줄만 사용하세요.');
  const x=xmlEscape,q=n=>xmlTextEscape(quoteName(n,doc.dialect)),name=tableSqlName(table,q),col=f=>q(f.column.name),bind=f=>`#{${f.name}${o.jdbc?',jdbcType='+jdbcType(f.column.type):''}}`,pk=fields.filter(f=>f.column.pk),ai=fields.filter(f=>f.column.ai);
  const where=pk.length?pk.map(f=>`${col(f)} = ${bind(f)}`).join(' AND '):'1 = 0';
  const write=fields.filter(f=>!(o.skipIdentity&&f.column.ai)&&!(o.skipDefaults&&f.column.default));const change=fields.filter(f=>!f.column.pk&&!f.column.ai);
  const warnings=[];if(!pk.length)warnings.push('PK가 없어 단건 조회·UPDATE·DELETE 조건은 WHERE 1 = 0으로 생성합니다.');
  if(!o.jdbc)warnings.push('jdbcType을 생략하면 NULL 바인딩에 별도 JDBC 설정이 필요할 수 있습니다.');
  if(o.keyMode!=='none'&&(!o.skipIdentity||ai.length!==1))throw Error('자동생성 키 반환은 자동증가 컬럼 1개를 INSERT에서 제외할 때 사용할 수 있습니다.');
  if(o.keyMode==='db2'&&doc.dialect!=='db2')throw Error('IDENTITY_VAL_LOCAL은 DB2에서만 사용할 수 있습니다.');
  if(o.keyMode==='jdbc')warnings.push('JDBC 자동생성 키 반환은 사용 중인 DB와 드라이버의 지원을 확인하세요.');
  const lines=['<?xml version="1.0" encoding="UTF-8"?>','<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">',`<mapper namespace="${x(o.namespace)}">`];
  const comment=s=>`  <!-- ${xmlTextEscape(s).replace(/-{2,}/g,v=>v.split('').join(' ')).replace(/-$/,'- ')} -->`;if(o.comments)lines.push(comment(`${table.logical||table.name} · ${table.name} · ${doc.dialect.toUpperCase()}`));
  for(const w of warnings)lines.push(comment(w));
  lines.push(`  <resultMap id="baseResultMap" type="${x(o.voType)}">`,...fields.map(f=>`    <${f.column.pk?'id':'result'} column="${x(f.column.name)}" property="${x(f.name)}"${o.jdbc?' jdbcType="'+jdbcType(f.column.type)+'"':''}/>`),'  </resultMap>','',`  <sql id="baseColumns">${fields.map(col).join(', ')}</sql>`,'');
  const start=(tag,id,extra='')=>`  <${tag} id="${id}" parameterType="${x(o.voType)}"${extra}>`;
  if(o.select){lines.push(start('select','selectById',' resultMap="baseResultMap"'),'    SELECT <include refid="baseColumns"/>',`    FROM ${name} WHERE ${where}`,'  </select>','',start('select','selectList',' resultMap="baseResultMap"'),'    SELECT <include refid="baseColumns"/>',`    FROM ${name}`,'    <where>',...fields.filter(f=>!['BLOB','CLOB','DBCLOB','TEXT','XML','BINARY','VARBINARY'].includes(typeInfo(f.column).base)).map(f=>`      <if test="${f.name} != null">AND ${col(f)} = ${bind(f)}</if>`),'    </where>',...(pk.length?[`    ORDER BY ${pk.map(col).join(', ')}`]:[]),'  </select>','');}
  if(o.insert){const extra=o.keyMode==='jdbc'?` useGeneratedKeys="true" keyProperty="${ai[0].name}" keyColumn="${x(ai[0].column.name)}"`:'';lines.push(start('insert','insert',extra));
    if(o.keyMode==='db2'){const key=ai[0],type=javaType(key.column.type);if(!['Short','Integer','Long','BigDecimal'].includes(type))throw Error('DB2 자동증가 키 타입을 확인하세요.');lines.push(`    <selectKey keyProperty="${key.name}" resultType="${type==='BigDecimal'?'java.math.':'java.lang.'}${type}" order="AFTER">`,'      VALUES IDENTITY_VAL_LOCAL()','    </selectKey>');}
    if(write.length)lines.push(`    INSERT INTO ${name} (${write.map(col).join(', ')})`,`    VALUES (${write.map(bind).join(', ')})`);
    else if(doc.dialect==='db2')lines.push(`    INSERT INTO ${name} (${col(fields[0])}) VALUES (DEFAULT)`);
    else if(doc.dialect==='mysql')lines.push(`    INSERT INTO ${name} () VALUES ()`);else lines.push(`    INSERT INTO ${name} DEFAULT VALUES`);
    lines.push('  </insert>','');}
  if(o.update){if(!change.length)lines.push(comment('PK / 자동증가 컬럼만 있어 UPDATE를 생성하지 않습니다.'));else {lines.push(start('update','updateById'),`    UPDATE ${name}`);if(o.updateNulls)lines.push('    SET '+change.map(f=>`${col(f)} = ${bind(f)}`).join(', '));else{const any=change.map(f=>`${f.name} != null`).join(' or ');lines.push('    <choose>',`      <when test="${any}">`,'        <set>',...change.map(f=>`          <if test="${f.name} != null">${col(f)} = ${bind(f)},</if>`),'        </set>','      </when>',`      <otherwise>SET ${col(change[0])} = ${col(change[0])}</otherwise>`,'    </choose>');}lines.push(`    WHERE ${where}`);if(!o.updateNulls)lines.push(`    <if test="!(${change.map(f=>`${f.name} != null`).join(' or ')})">AND 1 = 0</if>`);lines.push('  </update>','');}}
  if(o.delete)lines.push(start('delete','deleteById'),`    DELETE FROM ${name} WHERE ${where}`,'  </delete>','');lines.push('</mapper>');
  return {text:lines.join('\n')+'\n',fileName:className+'Mapper.xml',fields,warnings};
}
