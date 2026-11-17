import React,{useState,useRef} from 'react';

export default function SchemaName({value,tableName,onChange}) {
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[error,setError]=useState('');
  const cancelled=useRef(false);
  const save=()=>{
    if(cancelled.current)return;
    try{if(draft.trim()!==(value||''))onChange(draft);setEditing(false);setError('');}
    catch(e){setError(e.message);}
  };
  return <span className="schema-editor nodrag nopan nowheel" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
    {editing?<input autoFocus aria-label={`${tableName} 스키마명`} aria-invalid={!!error} value={draft} maxLength={128}
      onFocus={e=>e.target.select()} onChange={e=>{setDraft(e.target.value);setError('');}} onBlur={save}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();save();}else if(e.key==='Escape'){e.preventDefault();cancelled.current=true;setEditing(false);setError('');}}}/>
      :<button type="button" className="schema-name" title="클릭하여 스키마명 변경" aria-label={`${tableName} 스키마명 변경: ${value||'없음'}`} onClick={()=>{cancelled.current=false;setDraft(value||'');setError('');setEditing(true);}}>{value||'스키마 없음'}</button>}
    {error&&<span role="alert" className="errors">{error}</span>}
  </span>;
}
