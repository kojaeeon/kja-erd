import {useEffect,useRef,useState} from 'react';
export default function useColumnReorder(tableId,onDrop) {
  const state=useRef(null),[drag,setDrag]=useState(null);
  const cancel=()=>{state.current=null;setDrag(null);};
  useEffect(()=>{const escape=e=>{if(e.key==='Escape'&&state.current){e.preventDefault();e.stopPropagation();cancel();}};document.addEventListener('keydown',escape,true);return()=>document.removeEventListener('keydown',escape,true);},[]);
  const begin=(e,columnId)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);state.current={columnId,x:e.clientX,y:e.clientY,active:false};};
  const move=e=>{const current=state.current;if(!current)return;e.stopPropagation();if(!current.active&&Math.hypot(e.clientX-current.x,e.clientY-current.y)<4)return;
    const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('.column-row[data-column-id]');const table=row?.closest('[data-table-id]');
    const targetId=table?.dataset.tableId===tableId?row.dataset.columnId:null,placement=row&&e.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2?'after':'before';
    const next={...current,active:true,targetId,placement};state.current=next;if(drag?.targetId!==targetId||drag?.placement!==placement||!drag)setDrag(next);
  };
  const end=e=>{const current=state.current;e.stopPropagation();cancel();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(current?.active&&current.targetId&&current.columnId!==current.targetId)onDrop(current.columnId,current.targetId,current.placement);};
  return {drag,begin,move,end,cancel};
}
