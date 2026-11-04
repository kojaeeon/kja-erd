import React, {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {suggestTerms, termType} from './model';

export default function ColumnLogicalInput({column, terms, types, onChange, onSelect, autoFocus}) {
  const input = useRef(null), composing = useRef(false);
  const [value, setValue] = useState(column.logical ?? '');
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [position, setPosition] = useState(null);
  const listId = useId();
  const matches = suggestTerms(terms, value);
  const shown = matches.slice(0, 20);
  const expanded = open && !!value.trim() && !!position;

  useEffect(() => {if (!composing.current) setValue(column.logical ?? '');}, [column.logical]);
  useEffect(() => {
    if (!open) return;
    const locate = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upward = below < 170 && above > below;
      setPosition({left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width,
        maxHeight: Math.max(80, Math.min(300, upward ? above : below)),
        ...(upward ? {bottom: window.innerHeight - rect.top + 4} : {top: rect.bottom + 4})});
    };
    locate();
    window.addEventListener('resize', locate);
    document.addEventListener('scroll', locate, true);
    return () => {window.removeEventListener('resize', locate); document.removeEventListener('scroll', locate, true);};
  }, [open]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({block: 'nearest'});
  }, [active, listId]);

  const choose = term => {onSelect(term.id); setValue(term.logical); setOpen(false); setActive(-1); input.current?.focus();};
  return <><input ref={input} autoFocus={autoFocus} className={column.termId ? 'term-linked' : ''}
    aria-label={`${column.name} 논리명`} role="combobox" aria-autocomplete="list" aria-expanded={expanded}
    aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
    placeholder="논리명 / 용어 검색" autoComplete="off" value={value}
    title={column.termId ? '용어사전 연결됨 · 논리명을 수정하면 연결이 해제됩니다.' : '논리명 또는 물리명이 포함된 용어를 검색합니다.'}
    onFocus={() => {setOpen(true); setActive(-1);}} onBlur={() => {setOpen(false); setActive(-1);}}
    onCompositionStart={() => {composing.current = true;}}
    onCompositionEnd={e => {composing.current = false; onChange(e.currentTarget.value); setOpen(true); setActive(-1);}}
    onChange={e => {const next = e.target.value; setValue(next); setOpen(true); setActive(-1); if (!composing.current) onChange(next);}}
    onKeyDown={e => {
      if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === 'Escape') {e.stopPropagation(); setOpen(false); setActive(-1);}
      if (['ArrowDown', 'ArrowUp'].includes(e.key) && shown.length) {
        e.preventDefault(); e.stopPropagation(); setOpen(true);
        setActive(previous => e.key === 'ArrowDown' ? (previous + 1) % shown.length : (previous <= 0 ? shown.length - 1 : previous - 1));
      }
      if (e.key === 'Enter' && expanded && active >= 0 && shown[active]) {e.preventDefault(); e.stopPropagation(); choose(shown[active]);}
    }}/>
    {expanded && createPortal(<div className="term-suggestions nodrag nowheel" style={position}
      onWheel={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="term-suggestions-heading">용어사전 · {matches.length}개 일치 <span>↑↓ 선택 · Enter 적용</span></div>
      <div id={listId} role="listbox" aria-label="용어사전 검색 제안">
        {shown.map((term, index) => <div key={term.id} id={`${listId}-${index}`} role="option" aria-selected={active === index}
          className={`term-suggestion ${active === index ? 'highlighted' : ''}`}
          onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(term)}>
          <strong>{term.logical} <em className={'dictionary-origin '+term._scope}>{term._scope==='common'?'공용':'프로젝트'}</em></strong><span>{term.physical}</span><small>{termType(term, types) || '타입 미지정'}</small>
        </div>)}
      </div>
      {!shown.length && <p>일치하는 용어가 없습니다. 입력한 논리명을 그대로 사용합니다.</p>}
      {matches.length > shown.length && <p>상위 20개를 표시합니다. 검색어를 더 입력하세요.</p>}
      <div className="term-suggestions-hint">용어를 선택하면 물리명·타입·자리수가 함께 적용됩니다.</div>
    </div>, document.body)}
  </>;
}
