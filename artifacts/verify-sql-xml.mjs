import {demo} from '../src/model.js';
import {generateSqlXml} from '../src/sql-xml.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const d=demo();mkdirSync('artifacts/sql-xml-check',{recursive:true});
for(const [i,opts] of [{},{keyMode:'db2'},{keyMode:'jdbc',updateNulls:true,style:'upper'}].entries())writeFileSync(`artifacts/sql-xml-check/Example${i}.xml`,generateSqlXml(d,d.tables[1].id,opts).text);
