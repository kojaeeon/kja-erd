import {readDb2Metadata} from './src/db2-jdbc.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {exportExcel} from './src/excel-export.mjs';
import {createDatabase} from './src/create-database.mjs';
import {ProjectStore} from './src/project-store.mjs';
import {synchronize} from './src/model.js';
import {testDataTemplate,excelTestData} from './src/data-excel.mjs';
const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(root, 'data'), { recursive: true });
const db = new DatabaseSync(resolve(root, 'data/erd.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL);`);
const projectStore=new ProjectStore(db);
const production = process.argv.includes('--production');
const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(body)); };
const readBody=async req=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>5_000_000)throw new Error('파일 크기가 너무 큽니다.');}return JSON.parse(body);};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    try {
      if(req.method==='POST'&&['/api/db2/test','/api/db2/metadata'].includes(url.pathname)){return json(res,200,await readDb2Metadata(await readBody(req),url.pathname.endsWith('/test')?'test':'metadata'));}
      if(url.pathname==='/api/dictionaries/common'&&req.method==='GET')return json(res,200,projectStore.common.read(url.searchParams.get('compact')!=='1'));
      if(url.pathname==='/api/dictionaries/common'&&req.method==='PUT')return json(res,200,projectStore.common.save(await readBody(req)));
      if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,projectStore.startup());
      if(url.pathname==='/api/session'&&req.method==='PUT')return json(res,200,projectStore.rememberOpened((await readBody(req)).projectId));
      if(req.method==='POST'&&url.pathname==='/api/test-data/template'){
        const {document,tableId,includeIdentity}=await readBody(req);const buffer=await testDataTemplate(synchronize({...document,commonDictionary:projectStore.common.read()}),tableId,includeIdentity);res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="test-data.xlsx"'});return res.end(buffer);
      }
      if(req.method==='POST'&&url.pathname==='/api/test-data/import'){
        const {document,tableId,includeIdentity,content}=await readBody(req);if(typeof content!=='string'||content.length>2700000)throw Error('2MB 이하의 엑셀 파일을 선택하세요.');return json(res,200,await excelTestData(synchronize({...document,commonDictionary:projectStore.common.read()}),tableId,Buffer.from(content,'base64'),includeIdentity));
      }
      if(req.method==='POST'&&url.pathname==='/api/export/excel'){
        const buffer=await exportExcel(synchronize({...await readBody(req),commonDictionary:projectStore.common.read()}));res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="erd.xlsx"'});return res.end(buffer);
      }
      if(req.method==='POST'&&url.pathname==='/api/databases'){
        const {script}=await readBody(req);const result=createDatabase(script,resolve(root,'data/generated'));return json(res,201,{id:result.id,tables:result.tables,file:`data/generated/${result.id}.sqlite`,downloadUrl:`/api/databases/${result.id}/download`});
      }
      const databaseDownload=url.pathname.match(/^\/api\/databases\/([a-f0-9-]{36})\/download$/);
      if(req.method==='GET'&&databaseDownload){const path=resolve(root,'data/generated',databaseDownload[1]+'.sqlite');if(!existsSync(path))return json(res,404,{error:'생성된 DB 파일이 없습니다.'});res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':`attachment; filename="schema-${databaseDownload[1]}.sqlite"`});return res.end(readFileSync(path));}
      if (url.pathname === '/api/projects' && req.method === 'GET') return json(res, 200, projectStore.list(url.searchParams.get('trash')==='1'));
      const match = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9-]+)(\/(?:revisions|copy|restore))?$/);
      if (!match) return json(res, 404, { error: '잘못된 경로입니다.' });
      const id = match[1];
      if (req.method === 'POST' && match[2]==='/copy') return json(res,201,projectStore.copy(id));
      if (req.method === 'POST' && match[2]==='/restore') return json(res,200,projectStore.restore(id));
      if (req.method === 'DELETE' && !match[2]) return json(res,200,projectStore.trash(id));
      if (req.method === 'GET' && match[2]==='/revisions') return json(res, 200, db.prepare('SELECT id,created_at,document FROM revisions WHERE project_id=? ORDER BY id DESC LIMIT 30').all(id).map(r => ({ ...r, document: JSON.parse(r.document) })));
      if (req.method === 'GET' && !match[2]) {
        try{return json(res,200,projectStore.get(id));}catch(e){return json(res,404,{error:e.message});}
      }
      if (req.method === 'PUT' && !match[2]) {
        return json(res,200,projectStore.save(id,await readBody(req)));
      }
      return json(res, 405, { error: '지원하지 않는 요청입니다.' });
    } catch(e) { return json(res, e.status||400, { error: e.message }); }
  }
  if (vite) return vite.middlewares(req, res);
  const requested = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname));
  const dist = resolve(root, 'dist');
  if (requested !== dist && !requested.startsWith(dist + sep)) { res.writeHead(403); return res.end(); }
  const file = existsSync(requested) && extname(requested) ? requested : resolve(dist, 'index.html');
  try { res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
  catch { res.writeHead(404); res.end('Run npm run build first.'); }
});
server.listen(3000, '127.0.0.1', () => console.log('KJA ERD: http://127.0.0.1:3000 · SQLite: data/erd.sqlite'));
