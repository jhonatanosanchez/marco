import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './components/icons';
import { t } from './i18n';
import { draftWidgetPreviews } from './livePreview';

/** Tested widget copies already read as Blobs (previewUrl → Blob), so a draft change does not read them again. */
const widgetBlobs = new Map<string, Promise<Blob | null>>();
const widgetBlob = (url: string) => {
  let p = widgetBlobs.get(url);
  if (!p) {
    p = fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b && b.type.startsWith('image/') ? b : null))
      .catch(() => null);
    widgetBlobs.set(url, p);
  }
  return p;
};

/**
 * Live, scaled-down preview of a screen in an iframe. Reloaded whenever `reloadKey` changes.
 * `url` is the preview address (displayLinks.ts useScreenUrl with preview: the display then neither registers as a
 * connected screen nor writes its storage), `openUrl` the same screen for a new tab; null while it is not known yet.
 * `focus` (the Widgets page): the id of the one widget `live` places on the screen. The display says where it is
 * ('marco:preview-focus') and the frame zooms in on it (unless `zoom` is false: full screen); `reload` changes when a
 * test asks the display to load it again. `title`, `tag`, `extra` (a row under the bar) and `note` (above the hint)
 * dress the panel for that use.
 */
export function Preview({ reloadKey, portrait, onClose, variant, saved, url, openUrl, screenName, choices, chosen, onChoose, hint, live, focus = null, zoom = true, reload = 0, title, tag, extra, note }: { reloadKey: number; portrait: boolean; onClose?: () => void; variant: 'side' | 'sheet'; saved: boolean; url: string | null; openUrl: string | null; screenName?: string; choices?: { value: string; label: string }[]; chosen?: string; onChoose?: (v: string) => void; hint?: string; live?: unknown; focus?: string | null; zoom?: boolean; reload?: number; title?: string; tag?: string; extra?: ComponentChildren; note?: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [orient, setOrient] = useState<'land' | 'port'>(portrait ? 'port' : 'land');
  useEffect(() => setOrient(portrait ? 'port' : 'land'), [portrait]);
  useEffect(() => setLoaded(false), [reloadKey, orient, url]);
  // unsaved settings (null = none): sent again whenever they change and each time the page in the frame loads
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (live === undefined || !loaded || !url) return;
    try {
      const origin = new URL(url, location.href).origin;
      frame.current?.contentWindow?.postMessage({ type: 'marco:preview-draft', config: live, focus }, origin);
      // Marco Cloud: unsaved widgets show the copy their last test made (the server only serves saved ones)
      for (const pv of live ? draftWidgetPreviews() : []) {
        void widgetBlob(pv.url).then((blob) => {
          if (blob) frame.current?.contentWindow?.postMessage({ type: 'marco:preview-widget', id: pv.id, v: pv.v, blob }, origin);
        });
      }
    } catch { /* the frame went away */ }
  }, [live, loaded, url, focus]);
  // a test of the widget: the display loads it again
  const lastReload = useRef(reload);
  useEffect(() => {
    if (reload === lastReload.current) return;
    lastReload.current = reload;
    if (!focus || !loaded || !url) return;
    try {
      frame.current?.contentWindow?.postMessage({ type: 'marco:preview-reload', id: focus }, new URL(url, location.href).origin);
    } catch { /* the frame went away */ }
  }, [reload, focus, loaded, url]);
  // where the focused widget is on the screen (null: nowhere yet, the whole screen is shown)
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useEffect(() => setRect(null), [focus, reloadKey, orient, url]);
  useEffect(() => {
    if (!focus) return;
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== 'marco:preview-focus' || e.data.id !== focus) return;
      const r = e.data.rect;
      setRect(r && [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n)) ? r : null);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [focus]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const W = orient === 'land' ? 1920 : 1080;
  const H = orient === 'land' ? 1080 : 1920;
  // In portrait, cap the height so it fits in the column.
  const maxH = variant === 'sheet' ? window.innerHeight * 0.7 : window.innerHeight * 0.62;
  // the part of the screen in view: all of it, or the focused widget with some of the screen around it
  const pad = 0.05 * Math.min(W, H);
  const crop = focus && zoom && rect
    ? (() => {
        const x0 = Math.max(0, rect.x - pad);
        const y0 = Math.max(0, rect.y - pad);
        return { x: x0, y: y0, w: Math.min(W, rect.x + rect.w + pad) - x0, h: Math.min(H, rect.y + rect.h + pad) - y0 };
      })()
    : { x: 0, y: 0, w: W, h: H };
  const zoomed = crop.w < W || crop.h < H;
  // never larger than on the TV itself
  const scale = Math.min(w / crop.w, orient === 'port' || zoomed ? maxH / crop.h : Infinity, 1) || 0.1;
  return (
    <div class={`preview preview--${variant} ${focus ? 'preview--widget' : ''}`}>
      <div class="preview__bar">
        <span class="live-dot" />
        <strong>
          {title ?? t('Vista previa')}
          {!choices && screenName && <span class="preview__scr"> · {screenName}</span>}
          {tag && <span class="preview__tag">{tag}</span>}
        </strong>
        {choices && (
          <select class="preview__pick" value={chosen} aria-label={t('Qué mostrar')} onChange={(e) => onChoose?.(e.currentTarget.value)}>
            {choices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <div class="preview__tools">
          <button type="button" class={`icon-btn ${orient === 'land' ? 'is-active' : ''}`} onClick={() => setOrient('land')} title={t('Horizontal')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="6" width="18" height="12" rx="2" />
            </svg>
          </button>
          <button type="button" class={`icon-btn ${orient === 'port' ? 'is-active' : ''}`} onClick={() => setOrient('port')} title={t('Vertical')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="6" y="3" width="12" height="18" rx="2" />
            </svg>
          </button>
          {/* the widget preview is not what the screen shows: no link to open it */}
          {saved && openUrl && !focus && (
            <a class="icon-btn" href={openUrl} target="_blank" rel="noopener" title={t('Abrir pantalla')}>
              <Icon name="external" size={15} />
            </a>
          )}
          {onClose && (
            <button type="button" class="icon-btn" onClick={onClose} title={t('Cerrar')}>
              <Icon name="x" size={15} />
            </button>
          )}
        </div>
      </div>
      {extra && <div class="preview__extra">{extra}</div>}
      <div class="preview__frame-wrap" ref={box}>
        <div class={`preview__frame ${zoomed ? 'is-zoomed' : ''}`} style={{ width: `${crop.w * scale}px`, height: `${crop.h * scale}px` }}>
          {!saved ? (
            <div class="preview__unsaved muted small">{t('Guarda para previsualizar esta pantalla')}</div>
          ) : w > 0 && url && (
            <iframe
              key={`${reloadKey}-${orient}-${url}`}
              ref={frame}
              src={`${url}${url.includes('?') ? '&' : '?'}v=${reloadKey}`}
              title={t('Vista previa')}
              loading="lazy"
              tabIndex={-1}
              style={{ width: `${W}px`, height: `${H}px`, transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px) scale(${scale})` }}
              onLoad={() => setLoaded(true)}
            />
          )}
          {saved && !loaded && <div class="preview__loading shimmer" />}
        </div>
      </div>
      {note}
      <p class="preview__hint muted small">{hint ?? t('Se recarga al guardar. Los cambios sin guardar no aparecen aquí.')}</p>
    </div>
  );
}
