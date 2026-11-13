import test from 'node:test';
import assert from 'node:assert/strict';
import {relationStyle,buildRelation,demo,copyProject,sql} from '../src/model.js';
test('relation appearance defaults preserve legacy semantics and custom style survives copying without SQL changes',()=>{
  assert.equal(relationStyle({identifying:true}).strokeDasharray,'');assert.equal(relationStyle({}).strokeDasharray,'6 4');
  const d=demo(),before=sql(d).text;d.relations[0]=buildRelation(d,{...d.relations[0],lineColor:'#ff1234',lineWidth:4.5,lineStyle:'dotted'});
  assert.deepEqual(relationStyle(copyProject(d).relations[0]),{stroke:'#ff1234',strokeWidth:4.5,strokeDasharray:'2 4'});assert.equal(sql(d).text,before);
  for(const patch of [{lineWidth:0},{lineWidth:11},{lineWidth:'abc'},{lineColor:'red'},{lineStyle:'bad'}])assert.throws(()=>buildRelation(d,{...d.relations[0],...patch}));
});
