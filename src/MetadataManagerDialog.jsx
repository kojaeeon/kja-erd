import React, {useEffect, useState} from 'react';
import {ArrowDown, ArrowUp, Plus, Trash2} from 'lucide-react';
import {column, moveColumn, uid} from './model';

const endpoint = '/api/metadata/tables';
const tableName = table => [table.schema, table.name].filter(Boolean).join('.');

async function requestMetadata(query, options) {
  const url = query ? endpoint + '?' + new URLSearchParams(query) : endpoint;
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '메타데이터 요청 실패');
  return data;
}

function editDraft(table, original = null) {
  return {
    original,
    table: {
      schema: table.schema ?? '',
      name: table.name,
      logical: table.logical ?? '',
      columns: table.columns.map(value => ({
        id: uid(), name: value.name, logical: value.logical ?? '', type: value.type ?? '',
        pk: value.pk ?? false, nullable: value.nullable ?? true, unique: value.unique ?? false,
        default: value.default ?? '', ai: value.ai ?? false, identityMode: value.identityMode ?? 'BY DEFAULT',
      })),
    },
  };
}

export default function MetadataManagerDialog({initialTable, onStatus}) {
  const [filters, setFilters] = useState({schema: '', search: ''});
  const [query, setQuery] = useState(filters);
  const [tables, setTables] = useState([]);
  const [draft, setDraft] = useState(() => initialTable ? editDraft(initialTable) : null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editing = draft !== null;

  useEffect(() => {
    if (editing) return;
    const controller = new AbortController();
    setLoading(true);
    setTables([]);
    requestMetadata(query, {signal: controller.signal})
      .then(result => { if (!controller.signal.aborted) setTables(result.tables); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [editing, query]);

  const startEditing = table => {
    setError('');
    setTarget(null);
    setDraft(editDraft(table, {schema: table.schema, name: table.name}));
  };

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await requestMetadata(draft.original, {
        method: draft.original ? 'PUT' : 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(draft.table),
      });
      const notice = `${tableName(saved)} 메타데이터 저장 완료`;
      setMessage(notice);
      onStatus(notice);
      if (!draft.original || draft.original.schema !== saved.schema || draft.original.name !== saved.name) {
        const next = {schema: saved.schema, search: saved.name};
        setFilters(next);
        setQuery(next);
      }
      setDraft(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await requestMetadata({schema: target.schema, name: target.name}, {method: 'DELETE'});
      const notice = `${tableName(target)} 메타데이터 삭제 완료`;
      setMessage(notice);
      onStatus(notice);
      setTarget(null);
      setQuery({...query});
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="metadata-manager">
    {error && <p role="alert" className="errors">{error}</p>}
    {editing ? <MetadataEditor
      table={draft.table} registering={!draft.original} busy={busy} onSave={save}
      onChange={table => setDraft({...draft, table})}
      onCancel={() => { setError(''); setDraft(null); }}
    /> : <>
      {message && <p role="status">{message}</p>}
      <form className="metadata-filters" onSubmit={e => {
        e.preventDefault();
        setTarget(null);
        setError('');
        setQuery({...filters});
      }}>
        <label>스키마 (비우면 전체)<input value={filters.schema} maxLength={128}
          onChange={e => setFilters({...filters, schema: e.target.value})}/></label>
        <label>테이블명 / 논리명<input value={filters.search} maxLength={256}
          onChange={e => setFilters({...filters, search: e.target.value})}/></label>
        <button className="primary" disabled={busy || loading} type="submit">조회</button>
      </form>
      {target && <div className="metadata-confirm" role="group" aria-label="메타데이터 삭제 확인">
        <p><strong>{tableName(target)}</strong> 테이블 정의와 컬럼 {target.columns.length}개를 SQLite 메타데이터에서 삭제할까요?</p>
        <div className="modal-actions">
          <button disabled={busy} onClick={() => setTarget(null)}>취소</button>
          <button className="danger" disabled={busy} onClick={remove}>메타데이터 삭제</button>
        </div>
      </div>}
      {loading && <p role="status">메타데이터 조회 중…</p>}
      {!loading && !tables.length && !error && <p>조회된 테이블이 없습니다. ERD 테이블의 메뉴에서 SQLite 메타데이터에 등록할 수 있습니다.</p>}
      {!!tables.length && <div className="definition-table-scroll">
        <table className="definition-preview">
          <thead><tr><th>스키마</th><th>테이블명</th><th>논리명</th><th>컬럼 수</th><th>관리</th></tr></thead>
          <tbody>{tables.map(table => <tr key={table.key}>
            <td>{table.schema || '—'}</td><td>{table.name}</td><td>{table.logical}</td><td>{table.columns.length}</td>
            <td className="metadata-row-actions">
              <button disabled={busy} aria-label={`${tableName(table)} 수정`} onClick={() => startEditing(table)}>수정</button>
              <button disabled={busy} aria-label={`${tableName(table)} 삭제`} onClick={() => { setError(''); setTarget(table); }}>삭제</button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </div>;
}

function MetadataEditor({table, registering, busy, onSave, onChange, onCancel}) {
  const changeTable = (key, value) => onChange({...table, [key]: value});
  const changeColumn = (id, patch) => changeTable('columns', table.columns.map(c => c.id === id ? {...c, ...patch} : c));
  const reorder = (id, direction) => {
    const next = {...table, columns: [...table.columns]};
    if (moveColumn(next, id, direction)) onChange(next);
  };
  const headings = ['물리명', '논리명', '타입', 'PK', 'NULL', 'UNIQUE', '기본값', 'IDENTITY', '순서 / 삭제'];
  return <form onSubmit={onSave}>
    {registering && <p>테이블과 컬럼 정의를 SQLite 메타데이터에 등록합니다.</p>}
    <fieldset disabled={busy}>
      <div className="metadata-filters">
        <label>스키마<input value={table.schema} maxLength={128} onChange={e => changeTable('schema', e.target.value)}/></label>
        <label>테이블 물리명<input required maxLength={256} value={table.name} onChange={e => changeTable('name', e.target.value)}/></label>
        <label>테이블 논리명<input maxLength={4096} value={table.logical} onChange={e => changeTable('logical', e.target.value)}/></label>
      </div>
      <div className="definition-table-scroll">
        <table className="definition-preview metadata-columns">
          <thead><tr>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{table.columns.map((c, index) => {
            const label = `${index + 1}번째 컬럼`;
            return <tr key={c.id}>
              <td><input required aria-label={label + ' 물리명'} maxLength={256} value={c.name} onChange={e => changeColumn(c.id, {name: e.target.value})}/></td>
              <td><input aria-label={label + ' 논리명'} maxLength={4096} value={c.logical} onChange={e => changeColumn(c.id, {logical: e.target.value})}/></td>
              <td><input required aria-label={label + ' 타입'} maxLength={4096} value={c.type} onChange={e => changeColumn(c.id, {type: e.target.value})}/></td>
              <td><input type="checkbox" aria-label={label + ' PK'} checked={c.pk} onChange={e => changeColumn(c.id, {pk: e.target.checked, ...(e.target.checked && {nullable: false})})}/></td>
              <td><input type="checkbox" aria-label={label + ' NULL 허용'} disabled={c.pk || c.ai} checked={!!c.nullable && !c.pk && !c.ai} onChange={e => changeColumn(c.id, {nullable: e.target.checked})}/></td>
              <td><input type="checkbox" aria-label={label + ' UNIQUE'} checked={c.unique} onChange={e => changeColumn(c.id, {unique: e.target.checked})}/></td>
              <td><input aria-label={label + ' 기본값'} maxLength={4096} readOnly={c.ai && !c.default} value={c.default} onChange={e => changeColumn(c.id, {default: e.target.value})}/></td>
              <td><select aria-label={label + ' IDENTITY'} value={c.ai ? c.identityMode : ''} onChange={e => {
                const mode = e.target.value;
                changeColumn(c.id, mode ? {ai: true, identityMode: mode, nullable: false, default: ''} : {ai: false, identityMode: 'BY DEFAULT'});
              }}><option value="">사용 안 함</option><option value="BY DEFAULT">BY DEFAULT</option><option value="ALWAYS">ALWAYS</option></select></td>
              <td className="metadata-row-actions">
                <button type="button" aria-label={label + ' 위로'} disabled={index === 0} onClick={() => reorder(c.id, -1)}><ArrowUp size={14}/></button>
                <button type="button" aria-label={label + ' 아래로'} disabled={index === table.columns.length - 1} onClick={() => reorder(c.id, 1)}><ArrowDown size={14}/></button>
                <button type="button" aria-label={label + ' 삭제'} onClick={() => changeTable('columns', table.columns.filter(item => item.id !== c.id))}><Trash2 size={14}/></button>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <button type="button" onClick={() => changeTable('columns', [...table.columns, column('', '', 'TEXT')])}><Plus size={15}/> 컬럼 추가</button>
    </fieldset>
    <div className="modal-actions">
      <button type="button" disabled={busy} onClick={onCancel}>목록으로</button>
      <button type="submit" className="primary" disabled={busy || !table.columns.length}>{registering ? 'SQLite 메타데이터에 등록' : '변경 저장'}</button>
    </div>
  </form>;
}
