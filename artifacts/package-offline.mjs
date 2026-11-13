import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {mkdirSync,existsSync,readFileSync,writeFileSync,cpSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative,join} from 'node:path';
const root=process.cwd(),out=resolve(root,'release/KJA-ERD-offline-node24');
if(existsSync(out))throw Error('Output exists; choose another output folder.');
const db=new DatabaseSync(resolve(root,'data/erd.sqlite'));
const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();if(checkpoint.busy)throw Error('SQLite checkpoint is busy');
const integrity=db.prepare('PRAGMA integrity_check').get();if(Object.values(integrity)[0]!=='ok')throw Error('SQLite integrity check failed');
const dataSummary={projects:db.prepare('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL').get().n,revisions:db.prepare('SELECT COUNT(*) n FROM revisions').get().n};db.close();
mkdirSync(join(out,'src'),{recursive:true});cpSync(resolve(root,'dist'),join(out,'dist'),{recursive:true});
cpSync('C:/Program Files/nodejs/node.exe',join(out,'node.exe'));
cpSync(resolve(root,'data/erd.sqlite'),join(out,'data/erd.sqlite'),{recursive:true});
if(existsSync(resolve(root,'data/generated')))cpSync(resolve(root,'data/generated'),join(out,'data/generated'),{recursive:true});
cpSync(resolve(root,'server.mjs'),join(out,'server.mjs'));
mkdirSync(join(out,'docs'),{recursive:true});for(const name of ['sqlite-metadata-guide.md','metadata-example.sql'])cpSync(join(root,'docs',name),join(out,'docs',name));
for(const file of ['model.js','project-store.mjs','create-database.mjs','excel-export.mjs','data-excel.mjs','table-sql.js','common-dictionary-store.mjs','metadata-store.mjs','metadata-schema.sql'])cpSync(join(root,'src',file),join(out,'src',file));
writeFileSync(join(out,'package.json'),JSON.stringify({name:'kja-erd-offline',version:'1.0.0',private:true,type:'module',scripts:{start:'node server.mjs --production'},engines:{node:'>=24.10'},dependencies:{exceljs:JSON.parse(readFileSync(join(root,'node_modules/exceljs/package.json'))).version}},null,2));
const packages=new Map();
function locate(name,from){const req=createRequire(join(from,'package.json'));try{return dirname(req.resolve(name+'/package.json'));}catch{let current=dirname(req.resolve(name));while(current!==dirname(current)){const manifest=join(current,'package.json');if(existsSync(manifest)&&JSON.parse(readFileSync(manifest)).name===name)return current;current=dirname(current);}throw Error('Cannot resolve '+name);}}
function walk(name,from){const directory=locate(name,from);if(packages.has(directory))return;const manifest=JSON.parse(readFileSync(join(directory,'package.json')));packages.set(directory,manifest);for(const dependency of Object.keys(manifest.dependencies||{}))walk(dependency,directory);for(const dependency of Object.keys(manifest.optionalDependencies||{})){try{walk(dependency,directory);}catch{}}}
walk('exceljs',root);
for(const directory of [...packages.keys()].sort((a,b)=>a.length-b.length)){const rel=relative(root,directory);if(rel.startsWith('..'))throw Error('Dependency outside workspace: '+directory);cpSync(directory,join(out,rel),{recursive:true});}
let licenses='Frontend dependency license notices\n\n';const licensed=new Set();
function collect(name,from){const directory=locate(name,from);if(licensed.has(directory))return;licensed.add(directory);const manifest=JSON.parse(readFileSync(join(directory,'package.json')));licenses+=`\n=== ${manifest.name} ${manifest.version} ===\n`;for(const file of readdirSync(directory).filter(f=>/^(license|licence|copying|notice)(\.|$)/i.test(f)))try{licenses+=readFileSync(join(directory,file),'utf8')+'\n';}catch{}for(const dep of Object.keys(manifest.dependencies||{}))collect(dep,directory);}
for(const name of ['react','react-dom','@xyflow/react','lucide-react','html-to-image'])collect(name,root);
writeFileSync(join(out,'THIRD_PARTY_NOTICES.txt'),licenses);
writeFileSync(join(out,'start-kja-erd.cmd'),'@echo off\r\ncd /d "%~dp0"\r\necho KJA ERD - http://127.0.0.1:3000\r\necho Keep this window open. Press Ctrl+C to stop.\r\n"%~dp0node.exe" "%~dp0server.mjs" --production\r\npause\r\n');
writeFileSync(join(out,'READ-ME.txt'),`KJA ERD 폐쇄망 실행 안내\n\nWindows x64 / Node v24.15.0 포함\n\n1. ZIP 전체를 쓰기 가능한 폴더에 압축 해제하세요.\n2. start-kja-erd.cmd를 더블 클릭하세요.\n3. 브라우저에서 http://127.0.0.1:3000 을 여세요.\n4. 실행 창은 열어 두세요. 종료하려면 Ctrl+C를 누르세요.\n\n인터넷 연결, npm install, 기존 Node 설치 변경은 필요하지 않습니다.\n동봉된 node.exe를 사용합니다. 시스템 Node 22.2로 실행하지 마세요.\n3000번 포트를 다른 프로그램이 사용 중이면 해당 프로그램을 먼저 종료하세요.\n\n백업: 저장 버튼을 누르고 서버를 종료한 뒤 data 폴더 전체를 복사하세요.\n데이터: data/erd.sqlite (프로젝트·사전·저장 이력·휴지통 포함)\n생성된 DB: data/generated\n\n주의: 기존 설치 폴더에 덮어쓰면 data/erd.sqlite도 바뀝니다. 별도 폴더에 해제하세요.\n이 ZIP에는 현재 저장된 데이터가 포함되어 있습니다. 로컬 브라우저 설정은 포함되지 않습니다.\n`);
writeFileSync(join(out,'BUILD-INFO.json'),JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,dataSummary,runtimePackages:[...packages.values()].map(p=>({name:p.name,version:p.version}))},null,2));
console.log(JSON.stringify({folder:out,runtimePackages:packages.size,integrity,checkpoint,...dataSummary}));
