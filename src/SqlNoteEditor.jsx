import React, {useEffect, useRef} from 'react';
import {EditorState, Compartment, Transaction} from '@codemirror/state';
import {EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, keymap} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap, indentWithTab} from '@codemirror/commands';
import {HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput} from '@codemirror/language';
import {sql, StandardSQL, MySQL, PostgreSQL, SQLite} from '@codemirror/lang-sql';
import {tags} from '@lezer/highlight';

const dialects = {db2: StandardSQL, mysql: MySQL, postgres: PostgreSQL, sqlite: SQLite};
const highlighting = HighlightStyle.define([
  {tag: tags.keyword, class: 'note-sql-keyword'},
  {tag: [tags.string, tags.special(tags.string)], class: 'note-sql-string'},
  {tag: tags.comment, class: 'note-sql-comment'},
  {tag: [tags.number, tags.bool, tags.null], class: 'note-sql-number'},
  {tag: tags.typeName, class: 'note-sql-type'},
  {tag: tags.operator, class: 'note-sql-operator'},
]);

export default function SqlNoteEditor({value, dialect, onChange}) {
  const host = useRef(null), view = useRef(null), change = useRef(onChange);
  const language = useRef(new Compartment()), external = useRef(false);
  change.current = onChange;
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({doc: value, extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
        history(), bracketMatching(), indentOnInput(), EditorState.tabSize.of(4),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        language.current.of(sql({dialect: dialects[dialect] || StandardSQL})),
        syntaxHighlighting(highlighting),
        EditorView.contentAttributes.of({'aria-label': '메모 SQL 코드', spellcheck: 'false'}),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !external.current) change.current(update.state.doc.toString());
        }),
      ]}),
    });
    view.current = editor;
    return () => {editor.destroy(); view.current = null;};
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    external.current = true;
    try {
      editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: value},
        annotations: Transaction.addToHistory.of(false)});
    } finally {external.current = false;}
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({effects: language.current.reconfigure(sql({dialect: dialects[dialect] || StandardSQL}))});
  }, [dialect]);
  return <div ref={host} className="note-sql-editor nodrag nopan nowheel" onKeyDown={event => event.stopPropagation()}/>;
}
