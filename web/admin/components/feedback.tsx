import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { Icon } from './icons';

/* ------------------------------------------------------------------ toasts */

type ToastKind = 'ok' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  leaving?: boolean;
}

let toasts: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: ToastKind = 'ok', ms = kind === 'error' ? 6000 : 3200) {
  const id = ++seq;
  toasts = [...toasts.slice(-3), { id, kind, text }];
  emit();
  setTimeout(() => dismiss(id), ms);
}

function dismiss(id: number) {
  toasts = toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x));
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    emit();
  }, 220);
}

export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div class={`toast toast--${x.kind} ${x.leaving ? 'is-leaving' : ''}`} key={x.id} onClick={() => dismiss(x.id)}>
          <span class="toast__icon">
            <Icon name={x.kind === 'ok' ? 'check' : x.kind === 'error' ? 'alert' : 'info'} size={16} />
          </span>
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ confirm dialog */

interface ConfirmOpts {
  title: string;
  body?: ComponentChildren;
  confirm?: string;
  cancel?: string;
  danger?: boolean;
}
let pending: (ConfirmOpts & { resolve: (v: boolean) => void }) | null = null;
const dlgListeners = new Set<() => void>();

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    pending?.resolve(false);
    pending = { ...opts, resolve };
    dlgListeners.forEach((l) => l());
  });
}

export function DialogHost() {
  const [, force] = useState(0);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    dlgListeners.add(l);
    return () => void dlgListeners.delete(l);
  }, []);
  useEffect(() => {
    if (pending) okRef.current?.focus();
  });
  if (!pending) return null;
  const p = pending;
  const close = (v: boolean) => {
    pending = null;
    p.resolve(v);
    force((n) => n + 1);
  };
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close(false)} onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), close(false))}>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h3 id="dlg-title">{p.title}</h3>
        {p.body && <div class="modal__body">{p.body}</div>}
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" onClick={() => close(false)}>
            {p.cancel ?? t('Cancelar')}
          </button>
          <button type="button" ref={okRef} class={`btn ${p.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => close(true)}>
            {p.confirm ?? t('Aceptar')}
          </button>
        </div>
      </div>
    </div>
  );
}
