import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
export function validateDb2Connection(input={}) {
  const {url,user,password='',schema,driverPath}=input;
  if(typeof url!=='string'||!/^jdbc:db2:\/\/[^\s/]+\/[^\s:;]+(?::[^\r\n]*)?$/.test(url)||url.length>2000)throw Error('DB2 JDBC 주소를 입력하세요. 예: jdbc:db2://localhost:50000/SAMPLE');
  if(/(?:password|user|username)\s*=/i.test(url))throw Error('계정과 비밀번호는 JDBC 주소 대신 별도 입력란을 사용하세요.');
  if(typeof user!=='string'||!user.trim()||user.length>256||typeof password!=='string'||password.length>4096)throw Error('DB2 계정 정보를 확인하세요.');
  if(typeof schema!=='string'||!schema.trim()||schema.length>128)throw Error('가져올 스키마명을 입력하세요 (대소문자 구분).');
  const jar=driverPath||process.env.DB2_JDBC_JAR||resolve('drivers/db2jcc4.jar');
  if(typeof jar!=='string'||!jar.toLowerCase().endsWith('.jar')||!existsSync(jar))throw Error('IBM db2jcc4.jar 파일을 준비하고 서버의 드라이버 경로를 입력하세요.');
  return {url,user,password,schema,jar:resolve(jar)};
}
export async function readDb2Metadata(input,mode='metadata') {
  const cfg=validateDb2Connection(input);
  return new Promise((resolveResult,reject)=>{
    const child=spawn(process.env.JAVA_BIN||'java',['-Dfile.encoding=UTF-8','--class-path',cfg.jar+delimiter+fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('Db2Metadata.java',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let stdout='',stderr='',settled=false;const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolveResult(result);};
    const timer=setTimeout(()=>{child.kill();finish(Error('DB2 메타 조회 제한 시간(90초)을 초과했습니다.'));},90000);
    const safe=s=>[cfg.password,cfg.url].filter(Boolean).reduce((text,value)=>text.split(value).join('[숨김]'),s);
    child.on('error',()=>finish(Error('Java 실행 실패: Java 17 이상 설치 또는 JAVA_BIN 설정을 확인하세요.')));
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{stdout+=chunk;if(Buffer.byteLength(stdout)>8_000_000){child.kill();finish(Error('메타데이터가 너무 큽니다. 스키마를 좁혀주세요.'));}});
    child.stderr.on('data',chunk=>{if(stderr.length<16000)stderr+=chunk;});
    child.on('close',code=>{if(code!==0)return finish(Error(safe(stderr.trim()).slice(0,2000)||'DB2 접속에 실패했습니다.'));try{finish(null,JSON.parse(stdout));}catch{finish(Error('JDBC 메타데이터 응답을 읽을 수 없습니다.'));}});
    child.stdin.end([cfg.url,cfg.user,cfg.password,cfg.schema,mode].map(v=>Buffer.from(v).toString('base64')).join('\n')+'\n');
  });
}
