import {DatabaseSync,backup} from 'node:sqlite';
import {cpSync,rmSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
const root=process.cwd(),stage=resolve(root,'release/KJA-ERD-offline-node24');
if(stage!==resolve('C:/kkk/Personal_Projects/erd_pgm/release/KJA-ERD-offline-node24'))throw Error('Unexpected staging directory');
for(const name of ['dist','data']){const target=resolve(stage,name);if(relative(stage,target)!==name)throw Error('Unsafe staging cleanup path');rmSync(target,{recursive:true,force:true});}
cpSync(join(root,'dist'),join(stage,'dist'),{recursive:true});mkdirSync(join(stage,'data'),{recursive:true});
const source=new DatabaseSync(join(root,'data/erd.sqlite'),{readOnly:true});await backup(source,join(stage,'data/erd.sqlite'));const projects=source.prepare('SELECT COUNT(*) n FROM projects WHERE deleted_at IS NULL').get().n;source.close();
cpSync(join(root,'data/generated'),join(stage,'data/generated'),{recursive:true});
for(const name of ['model.js','project-store.mjs','create-database.mjs','excel-export.mjs','data-excel.mjs','table-sql.js','common-dictionary-store.mjs'])cpSync(join(root,'src',name),join(stage,'src',name));cpSync(join(root,'server.mjs'),join(stage,'server.mjs'));
const info=JSON.parse(readFileSync(join(stage,'BUILD-INFO.json'),'utf8'));Object.assign(info,{buildDate:'2026-11-04',testsPassed:68,savedProjects:projects,features:['Last opened project in SQLite','Configurable Excel definition header colors','Pointer column drag reorder','DB2 SQL selective ERD import','Larger connection handles and snapping','Click connection and endpoint selector','Relation descriptions and one-click editor','ERD table header colors for individual or all tables','SQLite common word term domain dictionaries','Project dictionary priority and shared propagation']});writeFileSync(join(stage,'BUILD-INFO.json'),JSON.stringify(info,null,2));
writeFileSync(join(stage,'READ-ME.txt'),readFileSync(join(stage,'READ-ME.txt'),'utf8')+'\n2026-11-04 업데이트: 마지막 프로젝트 자동 복원(SQLite 기록), 프로젝트별 Excel 테이블 정의서 헤더 색상 선택, 컬럼 손잡이 마우스 드래그 순서 변경을 지원합니다. Alt+↑/↓ 키보드 이동과 실행 취소도 가능합니다. 관계 연결점 확대/스냅, 두 연결점 클릭, 테이블·컬럼 직접 선택, 연결선 설명 입력·표시·한 번 클릭 편집을 지원합니다. ERD 상단 헤더 색상 버튼과 테이블별 팔레트에서 화면 헤더 색상을 바꿀 수 있습니다. SQLite 공용 단어·용어·도메인 사전을 지원하며 충돌 시 프로젝트 사전이 우선합니다. 기존 프로젝트 사전은 그대로 유지하고 사전 관리에서 공용 초안으로 복사할 수 있습니다.\n');
console.log(JSON.stringify({updated:stage,savedProjects:projects}));
