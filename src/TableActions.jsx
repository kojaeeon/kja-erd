import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {MoreHorizontal, Code2, Copy, Trash2, List,FlaskConical,BookOpen} from 'lucide-react';

export default function TableActions({name, onSql, onTestData, onFavorites, onJavaVo, onSqlXml, onIndexes, onCopy, onDelete}) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(), menu = useRef();
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('button')?.focus();
    const close = e => {if(!menu.current?.contains(e.target) && !trigger.current?.contains(e.target))setPosition(null);};
    const escape = e => {if(e.key==='Escape'){e.stopPropagation();setPosition(null);trigger.current?.focus();}};
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', close);document.removeEventListener('keydown', escape);};
  }, [position]);
  const run = action => {setPosition(null);action();};
  return <><button ref={trigger} aria-label={`${name} 메뉴`} aria-haspopup="menu" aria-expanded={!!position}
    onClick={() => {if(position){setPosition(null);return;}const r=trigger.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.right-190,window.innerWidth-198)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-360))});}}><MoreHorizontal size={14}/> 메뉴</button>
    {position && createPortal(<div ref={menu} className="table-actions-menu nodrag nowheel" style={position} role="menu" aria-label={`${name} 테이블 메뉴`}
      onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...menu.current.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);buttons[(index+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length].focus();}}}>
      <button role="menuitem" onClick={()=>run(onSql)}><Code2 size={15}/> SQL OUT · 이 테이블</button>
      <button role="menuitem" onClick={()=>run(onTestData)}><FlaskConical size={15}/> 테스트 데이터 생성</button>
      <button role="menuitem" onClick={()=>run(onFavorites)}><BookOpen size={15}/> 즐겨쓰는 SQL 예시</button>
      <button role="menuitem" onClick={()=>run(onJavaVo)}><Code2 size={15}/> Java VO 생성</button>
      <button role="menuitem" onClick={()=>run(onSqlXml)}><Code2 size={15}/> SQL XML 생성</button>
      <button role="menuitem" onClick={()=>run(onIndexes)}><List size={15}/> 인덱스 / UNIQUE</button>
      <button role="menuitem" onClick={()=>run(onCopy)}><Copy size={15}/> 테이블 복제</button>
      <button role="menuitem" onClick={()=>run(onDelete)}><Trash2 size={15}/> 테이블 삭제</button>
    </div>,document.body)}
  </>;
}
