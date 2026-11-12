export const NOTE_MIN_SIZE = {width: 260, height: 160};
export const NOTE_DEFAULT_SIZE = {width: 360, height: 240};

export function noteSize(note) {
  const dimension = key => Number.isFinite(note[key])
    ? Math.max(NOTE_MIN_SIZE[key], Math.min(4000, note[key]))
    : NOTE_DEFAULT_SIZE[key];
  return {width: dimension('width'), height: dimension('height')};
}

// React Flow supplies graph coordinates, including when the canvas is zoomed.
export function resizeNote(document, id, params) {
  const note = document.notes.find(n => n.id === id);
  if (!note) return;
  Object.assign(note, noteSize(params));
  if (Number.isFinite(params.x) && Number.isFinite(params.y)) {
    note.position = {x: params.x, y: params.y};
  }
}

export async function copyNoteText(text, container = document.body) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* Intranet HTTP and denied clipboard permission use native copy. */ }
  const active = document.activeElement;
  const input = document.createElement('textarea');
  input.value = text;
  input.readOnly = true;
  input.className = 'nodrag nopan nowheel';
  input.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  container.appendChild(input);
  try {
    input.focus();
    input.select();
    if (!document.execCommand('copy')) throw Error('클립보드에 접근할 수 없습니다. SQL을 선택해 Ctrl+C로 복사하세요.');
  } finally {
    input.remove();
    active?.focus({preventScroll: true});
  }
}
