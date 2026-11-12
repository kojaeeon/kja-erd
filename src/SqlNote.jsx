import React, {useCallback, useEffect, useRef, useState} from 'react';
import {NodeResizer} from '@xyflow/react';
import {StickyNote, Copy, Check, X} from 'lucide-react';
import SqlNoteEditor from './SqlNoteEditor';
import {NOTE_MIN_SIZE, copyNoteText} from './note';
import './note.css';

export default function SqlNote({note, selected, dialect, onChange, onDelete, onResizeStart, onResize, onResizeEnd, onStatus}) {
  const root = useRef(null), timer = useRef(null);
  const [copied, setCopied] = useState(false);
  const handleResize = useCallback((_, params) => onResize(params), [onResize]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async event => {
    event.stopPropagation();
    try {
      await copyNoteText(note.text, root.current);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
      onStatus('메모 SQL 복사 완료');
    } catch (error) {onStatus(error.message);}
  };
  return <div ref={root} className={`note-node${selected ? ' selected' : ''}`}>
    <NodeResizer isVisible={selected} minWidth={NOTE_MIN_SIZE.width} minHeight={NOTE_MIN_SIZE.height}
      maxWidth={4000} maxHeight={4000} color="#b68b24" onResizeStart={onResizeStart}
      onResize={handleResize} onResizeEnd={onResizeEnd}/>
    <header className="note-drag-handle"><StickyNote size={14}/><span>SQL 메모</span><small>SQL</small>
      <button type="button" className="nodrag nopan" aria-label="메모 SQL 복사" title={copied ? '복사 완료' : '메모 SQL 복사'}
        onClick={copy}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button>
      <button type="button" className="nodrag nopan" aria-label="메모 삭제" title="메모 삭제"
        onClick={event => {event.stopPropagation(); onDelete();}}><X size={14}/></button>
    </header>
    <SqlNoteEditor value={note.text} dialect={dialect} onChange={onChange}/>
    <footer>테두리·모서리 드래그로 크기 조절</footer>
  </div>;
}
