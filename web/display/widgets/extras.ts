// Custom message banner + to-do list cards (side panel).
import { ctx } from '../ctx';
import { esc, setHTML } from '../dom';
import { ICON } from '../icons';

export function renderMessage(root: HTMLElement): void {
  const m = ctx.cfg.message;
  const on = m.enabled && !!m.text.trim();
  root.style.display = on ? '' : 'none';
  if (!on) return;
  setHTML(root, `<span class="msg-em">${esc(m.emoji || '💬')}</span><span class="msg-tx">${esc(m.text)}</span>`);
}

export function renderTodo(root: HTMLElement): void {
  const td = ctx.cfg.todo;
  const items = (td.items || []).filter((i) => i.text?.trim());
  const on = td.enabled && items.length > 0;
  root.style.display = on ? '' : 'none';
  if (!on) return;
  const sorted = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)].slice(0, 6);
  setHTML(
    root,
    `<div class="card-h">✅ ${esc(ctx.t('todo'))}</div><ul>${sorted
      .map((i) => `<li class="${i.done ? 'done' : ''}">${i.done ? ICON.check : ICON.circle}<span>${esc(i.text)}</span></li>`)
      .join('')}</ul>`,
  );
}
