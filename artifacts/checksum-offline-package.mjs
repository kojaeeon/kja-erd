import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('release/KJA-ERD-offline-node24');const records=[];
function walk(directory){for(const item of readdirSync(directory,{withFileTypes:true})){const path=join(directory,item.name);if(item.isDirectory())walk(path);else if(item.name!=='CHECKSUMS.json') records.push({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});}}
walk(root);writeFileSync(join(root,'CHECKSUMS.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({files:records.length}));
