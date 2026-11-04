import test from 'node:test';
import assert from 'node:assert/strict';
import {javaName,javaType,generateJavaVo} from '../src/java-vo.js';
const table={name:'BLOG_POST',logical:'게시글',columns:[{id:'a',name:'POST_ID',type:'BIGINT',pk:true},{id:'b',name:'TOTAL_AMT',type:'DECIMAL(31,8)',nullable:true},{id:'c',name:'PUBLISHED_DT',type:'TIMESTAMP'},{id:'d',name:'PAYLOAD',type:'BLOB'}]};
test('Java naming handles acronyms, camel case, keywords and invalid characters',()=>{
  assert.equal(javaName('POST_ID'),'postId');assert.equal(javaName('userID'),'userId');assert.equal(javaName('XMLParser'),'xmlParser');assert.equal(javaName('postTitle','upper'),'POST_TITLE');assert.equal(javaName('POST_ID','pascal'),'PostId');assert.equal(javaName('class'),'class_');assert.equal(javaName('123_CODE'),'_123Code');assert.equal(javaName('bad-name','original'),'bad_name');
});
test('DB2 Java types preserve decimal precision and date types with imports',()=>{
  const before=structuredClone(table),r=generateJavaVo(table,{packageName:'com.example.vo',serializable:true});assert.match(r.text,/private BigDecimal totalAmt/);assert.match(r.text,/import java.time.LocalDateTime/);assert.match(r.text,/private byte\[\] payload/);assert.match(r.text,/public Long getPostId/);assert.match(r.text,/serialVersionUID/);assert.deepEqual(table,before);
  assert.equal(javaType('INTEGER',{boxed:false}),'int');assert.equal(javaType('TIMESTAMP',{dates:'sql'}),'Timestamp');assert.equal(javaType('CUSTOM'),'String');
});
test('VO generator supports Lombok, original names and validates collisions and injection',()=>{
  const r=generateJavaVo(table,{accessors:'lombok',style:'upper',prefix:'POST_',comments:false});assert.match(r.text,/@Getter\n@Setter/);assert.doesNotMatch(r.text,/public Long get/);assert.match(r.text,/private Long ID/);
  assert.throws(()=>generateJavaVo(table,{className:'X{}'}),/클래스명/);assert.throws(()=>generateJavaVo(table,{packageName:'a.class'}),/패키지명/);
  const duplicate={...table,columns:[{name:'POST_ID',type:'INT'},{name:'postId',type:'INT'}]};assert.throws(()=>generateJavaVo(duplicate),/중복/);
  const injected={...table,logical:'hi */ public class X {',columns:[{name:'CLASS',type:'INT',logical:'*/ bad'}]};assert.match(generateJavaVo(injected).text,/private Integer class_/);assert.doesNotMatch(generateJavaVo(injected).text,/hi \*\//);
});
