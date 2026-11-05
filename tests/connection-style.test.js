import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {relationStyle,buildRelation,demo,copyProject,sql} from '../src/model.js';
import {validateDb2Connection,readDb2Metadata} from '../src/db2-jdbc.mjs';
test('relation appearance defaults preserve legacy semantics and custom style survives copying without SQL changes',()=>{
  assert.equal(relationStyle({identifying:true}).strokeDasharray,'');assert.equal(relationStyle({}).strokeDasharray,'6 4');
  const d=demo(),before=sql(d).text;d.relations[0]=buildRelation(d,{...d.relations[0],lineColor:'#ff1234',lineWidth:4.5,lineStyle:'dotted'});
  assert.deepEqual(relationStyle(copyProject(d).relations[0]),{stroke:'#ff1234',strokeWidth:4.5,strokeDasharray:'2 4'});assert.equal(sql(d).text,before);
  for(const patch of [{lineWidth:0},{lineWidth:11},{lineWidth:'abc'},{lineColor:'red'},{lineStyle:'bad'}])assert.throws(()=>buildRelation(d,{...d.relations[0],...patch}));
});
test('JDBC validates connection and missing driver and does not invoke a shell',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'erd-jdbc-'));try{const jar=join(dir,'driver.jar');writeFileSync(jar,Buffer.from('504b0506000000000000000000000000000000000000','hex'));const valid={url:'jdbc:db2://localhost:50000/SAMPLE',user:'user',password:'secret',schema:'APP',driverPath:jar};
    assert.equal(validateDb2Connection(valid).schema,'APP');
    for(const patch of [{url:'jdbc:mysql://host/db'},{url:'jdbc:db2://host/db:password=secret;'},{schema:''},{user:''},{driverPath:join(dir,'missing.jar')}])assert.throws(()=>validateDb2Connection({...valid,...patch}));
    await assert.rejects(readDb2Metadata(valid),e=>!e.message.includes('secret')&&/드라이버/.test(e.message));
  }finally{rmSync(dir,{recursive:true,force:true});}
});
