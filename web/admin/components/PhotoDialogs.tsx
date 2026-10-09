// Gallery dialogs: duplicate-name resolution before an upload, and the focal-point editor.
import { useEffect, useRef, useState } from 'preact/hooks';
import { coverPosition, coverWindow, hasFocus, type PhotoFrame } from '../../shared/focus';
import type { AdminPhoto, PhotoConflictPolicy } from '../../shared/types';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { autoFocus } from '../photoTools';
import { formatBytes } from '../util';
import { toast } from './feedback';
import { Icon } from './icons';
import { Button, Modal, Segmented } from './ui';

/* ------------------------------------------------------------------ duplicate names */

export interface ConflictItem {
  key: string;
  /** name of the file the user picked */
  original: string;
  size: number;
  /** name it gets on the server */
  target: string;
  /** name with "keep both" */
  renamed?: string;
  existing?: AdminPhoto;
}

const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
const policyOptions = () => [
  { value: 'replace' as const, label: t('Reemplazar'), icon: 'repeat' as const },
  // phones: the outcome line under the name spells it out ("Se guardará como foto-2.jpg")
  { value: 'rename' as const, label: narrow() ? t('Ambas') : t('Conservar ambas'), icon: 'copy' as const, title: t('Conservar ambas') },
  { value: 'skip' as const, label: t('Omitir'), icon: 'x' as const },
];

export function ConflictDialog(props: { items: ConflictItem[]; onDone: (choices: Record<string, PhotoConflictPolicy> | null) => void }) {
  const [choices, setChoices] = useState<Record<string, PhotoConflictPolicy>>(() =>
    Object.fromEntries(props.items.map((i) => [i.key, 'rename' as PhotoConflictPolicy]))
  );
  const values = Object.values(choices);
  const all = values.every((v) => v === values[0]) ? values[0] : undefined;
  const n = props.items.length;
  const skipping = values.filter((v) => v === 'skip').length;
  return (
    <Modal
      title={n === 1 ? t('Ya existe una foto con ese nombre') : t('Ya existen {n} fotos con esos nombres', { n })}
      icon="copy"
      size="lg"
      onClose={() => props.onDone(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onDone(null)}>
            {t('Cancelar subida')}
          </Button>
          <Button variant="primary" icon="upload" onClick={() => props.onDone(choices)}>
            {skipping === n ? t('Continuar') : t('Continuar y subir')}
          </Button>
        </>
      }
    >
      <p class="muted conflict__intro">{t('Elige qué hacer con cada una. Las demás fotos se subirán normalmente.')}</p>
      {n > 1 && (
        <div class="conflict__all">
          <span class="conflict__all-label">{t('Aplicar a todas')}</span>
          <Segmented
            size="sm"
            value={all ?? ('' as PhotoConflictPolicy)}
            options={policyOptions()}
            onChange={(v) => setChoices(Object.fromEntries(props.items.map((i) => [i.key, v])))}
          />
        </div>
      )}
      <ul class="conflict__list">
        {props.items.map((it) => {
          const c = choices[it.key];
          return (
            <li class="conflict__row" key={it.key}>
              <div class="conflict__thumb">
                {it.existing ? <img src={it.existing.thumbUrl || it.existing.url} alt="" loading="lazy" decoding="async" /> : <Icon name="image" size={20} />}
              </div>
              <div class="conflict__info">
                <strong class="conflict__name" title={it.target}>
                  {it.target}
                </strong>
                <span class="muted small">
                  {t('Nueva: {name} · {size}', { name: it.original, size: formatBytes(it.size) })}
                  {it.existing && ` · ${t('actual: {size}', { size: formatBytes(it.existing.size) })}`}
                </span>
                <span class={`conflict__outcome conflict__outcome--${c}`}>
                  {c === 'replace'
                    ? t('Se sustituirá la foto actual')
                    : c === 'rename'
                      ? t('Se guardará como {name}', { name: it.renamed || it.target })
                      : t('No se subirá')}
                </span>
              </div>
              <Segmented size="sm" value={c} options={policyOptions()} onChange={(v) => setChoices((s) => ({ ...s, [it.key]: v }))} />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

/* ------------------------------------------------------------------ focal point editor */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Click / tap / drag on the photo to set the focal point; previews show the real crops: the display's photo panel
 * (`frame`, measured by a connected display: aspect + which bands the clock / weather card cover; the focal point
 * goes to the centre of the free band) and a full 16:9 screen. Only this photo's full image is loaded.
 */
export function FocusEditor(props: {
  photo: AdminPhoto;
  frame: PhotoFrame;
  panelLabel: string;
  panelNote: string;
  onClose: () => void;
  onSaved: (p: AdminPhoto) => void;
}) {
  const fr = props.frame;
  const p = props.photo;
  const initial = { x: hasFocus(p) ? p.focusX! : 0.5, y: hasFocus(p) ? p.focusY! : 0.5 };
  const [focus, setFocus] = useState(initial);
  const [size, setSize] = useState<{ w: number; h: number } | null>(p.w && p.h ? { w: p.w, h: p.h } : null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'auto' | 'save' | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dirty = focus.x !== initial.x || focus.y !== initial.y;

  const fromEvent = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    setFocus({ x: round(clamp01((e.clientX - r.left) / r.width)), y: round(clamp01((e.clientY - r.top) / r.height)) });
  };

  const auto = async () => {
    if (!img.current || !loaded) return;
    setBusy('auto');
    try {
      const f = await autoFocus(img.current);
      setFocus({ x: f.focusX, y: f.focusY });
    } catch {
      toast(t('No se pudo calcular el encuadre automático'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const r = await api.setPhotoFocus(p.file, focus.x, focus.y);
      toast(t('Encuadre guardado'));
      props.onSaved(r);
    } catch (e) {
      toast(`${t('No se pudo guardar')}: ${(e as ApiError).message}`, 'error');
      setBusy(null);
    }
  };

  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth) {
      setLoaded(true);
      setSize({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, []);

  const w = size?.w || 16, h = size?.h || 10;
  const ratio = w / h;
  // Crop windows drawn over the photo (fractions of the image)
  const rect = (bw: number, bh: number, ty = 0.5) => {
    const c = coverWindow(w, h, bw, bh, focus.x, focus.y, 0.5, ty);
    return { left: `${(c.cx - c.sx / 2) * 100}%`, top: `${(c.cy - c.sy / 2) * 100}%`, width: `${c.sx * 100}%`, height: `${c.sy * 100}%` };
  };
  const bg = (bw: number, bh: number, ty = 0.5) => ({
    backgroundImage: `url("${p.url}")`,
    backgroundPosition: coverPosition(w, h, bw, bh, focus.x, focus.y, 0.5, ty),
  });
  const panelWin = coverWindow(w, h, fr.aspect, 1, focus.x, focus.y, 0.5, fr.targetY);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    setFocus((f) => ({ x: round(clamp01(f.x + m[0])), y: round(clamp01(f.y + m[1])) }));
  };

  return (
    <Modal
      title={t('Encuadrar foto')}
      icon="target"
      size="xl"
      dirty={dirty && busy !== 'save'}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" icon="wand" class="focus-ed__auto" onClick={auto} loading={busy === 'auto'} disabled={!loaded || !!busy}>
            {t('Automático')}
          </Button>
          <Button variant="ghost" onClick={props.onClose} disabled={busy === 'save'}>
            {t('Cancelar')}
          </Button>
          <Button variant="primary" icon="check" onClick={save} loading={busy === 'save'} disabled={!!busy && busy !== 'save'}>
            {t('Guardar')}
          </Button>
        </>
      }
    >
      <div class="focus-ed">
        <div class="focus-ed__main">
          <div
            ref={stage}
            class={`focus-ed__stage ${loaded ? 'is-loaded' : ''}`}
            style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, calc(var(--focus-stage-h) * ${ratio.toFixed(4)}))` }}
            tabIndex={0}
            role="application"
            aria-label={t('Punto de foco: toca la foto o usa las flechas')}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              fromEvent(e);
            }}
            onPointerMove={(e) => dragging.current && fromEvent(e)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <img
              ref={img}
              src={p.url}
              alt={p.file}
              draggable={false}
              decoding="async"
              onLoad={(e) => {
                const el = e.currentTarget as HTMLImageElement;
                setSize({ w: el.naturalWidth, h: el.naturalHeight });
                setLoaded(true);
              }}
            />
            {!loaded && <span class="spinner focus-ed__spinner" />}
            {loaded && (
              <>
                <span class="focus-ed__crop focus-ed__crop--wide" style={rect(16, 9)} />
                <span class="focus-ed__crop focus-ed__crop--panel" style={rect(fr.aspect, 1, fr.targetY)} />
                <span class="focus-ed__dot" style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }} />
              </>
            )}
          </div>
          <p class="muted small focus-ed__hint">
            <Icon name="target" size={14} /> {t('Toca o arrastra sobre la foto para elegir lo que debe verse siempre (por ejemplo, las caras).')}
          </p>
        </div>
        <div class="focus-ed__previews">
          <figure class={`focus-prev ${fr.aspect < 1 ? 'focus-prev--side' : ''}`}>
            <div
              class={`focus-prev__box ${fr.aspect < 1 ? 'focus-prev__box--panel' : 'focus-prev__box--wide'}`}
              style={{ aspectRatio: `${fr.aspect.toFixed(4)} / 1`, ...bg(fr.aspect, 1, fr.targetY) }}
            >
              {loaded && (
                <>
                  {fr.blocks.map(([a, b]) => (
                    <span class="focus-prev__block" style={{ top: `${a * 100}%`, height: `${(b - a) * 100}%` }} />
                  ))}
                  <span class="focus-prev__dot" style={{ left: `${panelWin.ax * 100}%`, top: `${panelWin.ay * 100}%` }} />
                </>
              )}
            </div>
            <figcaption>
              <span class="focus-prev__title">
                <span class="focus-prev__swatch focus-prev__swatch--panel" />
                {props.panelLabel}
              </span>
              <span class="focus-prev__note">{props.panelNote}</span>
              {fr.blocks.length > 0 && (
                <span class="focus-prev__legend">
                  <span class="focus-prev__hatch" />
                  {t('Tapado por el reloj, los avisos y el tiempo: el punto de foco se coloca en la franja libre.')}
                </span>
              )}
            </figcaption>
          </figure>
          <figure class="focus-prev">
            <div class="focus-prev__box focus-prev__box--wide" style={{ aspectRatio: '16 / 9', ...bg(16, 9) }} />
            <figcaption>
              <span class="focus-prev__title">
                <span class="focus-prev__swatch focus-prev__swatch--wide" />
                {t('Pantalla completa 16:9')}
              </span>
            </figcaption>
          </figure>
          <a class="link-btn small focus-ed__open" href={p.url} target="_blank" rel="noopener">
            <Icon name="external" size={13} /> {t('Ver original')}
            {p.w && p.h ? ` · ${p.w}×${p.h}` : ''} · {formatBytes(p.size)}
          </a>
        </div>
      </div>
    </Modal>
  );
}
