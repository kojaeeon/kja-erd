import {mkdirSync,writeFileSync} from 'node:fs';
import {generateJavaVo} from '../src/java-vo.js';
const table={name:'T_SAMPLE',logical:'샘플',columns:[{name:'POST_ID',type:'BIGINT'},{name:'AMT',type:'DECIMAL(31,8)'},{name:'AT',type:'TIMESTAMP'},{name:'DAY',type:'DATE'},{name:'CLOCK',type:'TIME'},{name:'DATA',type:'BLOB'},{name:'CLASS',type:'INT'}]};
mkdirSync('artifacts/java-vo-check',{recursive:true});
for(const [i,options] of [{},{style:'upper',boxed:false,dates:'sql',serializable:true},{style:'original',comments:false,accessors:'none'}].entries())writeFileSync(`artifacts/java-vo-check/Example${i}.java`,generateJavaVo(table,{...options,className:`Example${i}`}).text);
