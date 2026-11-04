import React from 'react';
import {Copy,Trash2,RotateCcw,Settings2,FolderOpen,Plus,Database} from 'lucide-react';
import {tableView,tableViewFields} from './model';

export function ProjectMenuDialog({doc,busy,onView,onCopy,onDelete,onManage}) {
  return <div className="project-menu-actions"><p>{doc.name}</p>
    <button disabled={busy} onClick={onView}><Settings2 size={17}/> 테이블 표시 옵션</button>
    <button disabled={busy} onClick={onCopy}><Copy size={17}/> 프로젝트 복사</button>
    <button disabled={busy} onClick={onManage}><FolderOpen size={17}/> 프로젝트 관리 / 휴지통</button>
    <button disabled={busy} onClick={onDelete}><Trash2 size={17}/> 프로젝트 삭제</button>
    {busy&&<p role="status">처리 중…</p>}
  </div>;
}
export function TableViewSettings({doc,onChange}) {
  const view=tableView(doc);
  return <div className="table-view-settings"><p>이 프로젝트의 모든 테이블에 적용됩니다. 숨긴 항목도 설계 데이터와 SQL·엑셀에는 유지됩니다.</p>
    <div className="table-view-checks">{tableViewFields.map(field=><label className="check-label" key={field.key}>
      <input type="checkbox" aria-label={`${field.label} 표시`} checked={view[field.key]}
        disabled={field.key==='logical'&&!view.name||field.key==='name'&&!view.logical}
        onChange={e=>onChange({...view,[field.key]:e.target.checked})}/>{field.label}
    </label>)}</div><p className="hint">논리명·물리명 중 하나는 표시해야 합니다. 자동증가는 기존 AI 항목입니다.</p>
    <div className="modal-actions"><button onClick={()=>onChange(Object.fromEntries(tableViewFields.map(f=>[f.key,f.default])))}>기본 표시로 복원</button></div>
  </div>;
}
export function ProjectsDialog({projects,trash,showTrash,busy,activeId,onTab,onNew,onDemo,onLoad,onCopy,onDelete,onRestore}) {
  const items=showTrash?trash:projects;
  return <><div className="project-actions"><button className={!showTrash?'active':''} onClick={()=>onTab(false)}>프로젝트 {projects.length}</button><button className={showTrash?'active':''} onClick={()=>onTab(true)}>휴지통 {trash.length}</button></div>
    {!showTrash&&<div className="project-actions"><button disabled={busy} className="primary" onClick={onNew}><Plus size={15}/> 새 프로젝트</button><button disabled={busy} onClick={onDemo}>블로그 예제</button></div>}
    <div className="project-entries">{items.map(p=><div className="project-entry" key={p.id}>
      <button className="project-row" disabled={busy||showTrash} onClick={()=>onLoad(p.id)}><Database size={19}/><span>{p.name}{p.id===activeId&&<em>현재</em>}<small>{new Date(showTrash?p.deleted_at:p.updated_at).toLocaleString('ko-KR')}</small></span></button>
      <div className="project-entry-actions">{showTrash?<button disabled={busy} aria-label={`${p.name} 복원`} onClick={()=>onRestore(p.id)}><RotateCcw size={15}/> 복원</button>:<><button disabled={busy} aria-label={`${p.name} 복사`} title="프로젝트 복사" onClick={()=>onCopy(p.id)}><Copy size={15}/></button><button disabled={busy} aria-label={`${p.name} 삭제`} title="휴지통으로 이동" onClick={()=>onDelete(p)}><Trash2 size={15}/></button></>}</div>
    </div>)}</div>
    {!items.length&&<p className="hint">{showTrash?'휴지통이 비어 있습니다.':'저장된 프로젝트가 없습니다.'}</p>}
    {showTrash&&<p className="hint">삭제한 프로젝트는 설계와 저장 이력을 유지하며 복원할 수 있습니다.</p>}
    {busy&&<p role="status">처리 중…</p>}
  </>;
}
