// Profile photo of a family member (Familia > Miembros): the avatar button offers an emoji or a photo; a photo
// opens a simple round crop (drag to move, slider / wheel / pinch to zoom, arrows and + / - on the keyboard). The
// crop is drawn in the browser (EXIF orientation applied, HEIC through the lazy decoder of photoTools.ts) and only
// a small square JPEG is uploaded (POST /api/admin/family/photos). The server checks and cleans it again
// (server/core/familyPhotoCore.js) and answers its id, which goes into the member's `photo` with the save bar.
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { FamilyMember } from '../../shared/types';
import { api, ApiError } from '../api';
import { has } from '../caps';
import { clampCrop, cropRect, initialCrop, MAX_ZOOM, MIN_ZOOM, panBy, placement, stagePad, zoomTo, type Crop } from '../avatarCrop';
import { t } from '../i18n';
import { decodeImage, isHeic, looksLikeImage, PhotoError } from '../photoTools';
import { toast } from './feedback';
import { Icon } from './icons';
import { Button, EmojiPicker, Modal } from './ui';

/** Side of the square the admin uploads (familyPhotoCore.js UPLOAD_SIDE). */
const OUT_SIDE = 384;
/** Longest side kept while cropping (a 48 MP phone photo would otherwise sit in memory at full size). */
const WORK_SIDE = 1600;
const MAX_FILE_BYTES = 60 * 1024 * 1024;

export const memberPhotoUrl = (id: string | null | undefined) => (id && /^[a-f0-9]{24}$/.test(id) ? `/media/avatars/${id}` : null);

/** The member's photo (admin session cookie), or their emoji when there is none or it does not load. */
export function AvatarFace({ m }: { m: Pick<FamilyMember, 'avatar' | 'photo'> }) {
  const url = memberPhotoUrl(m.photo);
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) {
    return <img class="avatar-photo" src={url} alt="" draggable={false} onError={() => setBroken(url)} />;
  }
  return <>{m.avatar || '🙂'}</>;
}

const PHOTO_ERRORS: Record<string, string> = {
  heic: 'Este navegador no puede abrir fotos HEIC. Elige un JPG o PNG, o haz una captura de pantalla de la foto.',
  decode: 'No se ha podido abrir esta imagen. Prueba con un JPG o PNG.',
  'not-image': 'Ese archivo no es una imagen.',
  'too-big': 'La foto es demasiado grande (máximo 60 MB).',
};

function uploadError(e: unknown): string {
  const err = e as ApiError;
  const code = (err?.body as { code?: string } | null)?.code ?? '';
  if (code === 'too_many') return t('Hay demasiadas fotos sin guardar. Guarda los cambios y vuelve a probar.');
  if (err?.status === 0 || /network|fetch/i.test(String(err?.message))) return t('Sin conexión con el servidor.');
  return t('No se ha podido guardar la foto.');
}

/** Emoji or photo for one member: the avatar button with "Subir foto" / "Quitar foto" over the emoji list. */
export function MemberAvatarPicker({ m, onChange }: { m: FamilyMember; onChange: (patch: Partial<Pick<FamilyMember, 'avatar' | 'photo'>>) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // the avatar button: focus goes back to it when the crop closes
  const back = useRef<HTMLElement | null>(null);
  const hasPhoto = !!memberPhotoUrl(m.photo);
  // a server without profile photos: the emoji list only (a photo already in the config still shows)
  const photos = has('familyPhotos');
  const pickFile = () => input.current?.click();
  const done = () => {
    setFile(null);
    const el = back.current;
    if (el?.isConnected) requestAnimationFrame(() => el.focus({ preventScroll: true }));
  };
  return (
    <>
      <EmojiPicker
        size="lg"
        value={m.avatar}
        label={photos || hasPhoto ? t('Elegir emoji o foto') : t('Elegir emoji')}
        face={hasPhoto ? <AvatarFace m={m} /> : undefined}
        onChange={(v) => onChange({ avatar: v || '🙂', photo: null })}
        top={(close) => photos && (
          <div class="avatar-photo-actions">
            <Button
              size="sm"
              icon="upload"
              onClick={() => {
                close();
                back.current = document.activeElement as HTMLElement | null;
                pickFile();
              }}
            >
              {hasPhoto ? t('Cambiar foto') : t('Subir foto')}
            </Button>
            {hasPhoto && (
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                onClick={() => {
                  close();
                  onChange({ photo: null });
                }}
              >
                {t('Quitar foto')}
              </Button>
            )}
            {hasPhoto && <p class="muted small">{t('Si eliges un emoji, se usa en lugar de la foto.')}</p>}
          </div>
        )}
      />
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = '';
          if (f) setFile(f);
        }}
      />
      {file &&
        createPortal(
        <PhotoCropDialog
          file={file}
          color={m.color}
          onPickAnother={pickFile}
          onClose={done}
          onSave={(id) => {
            done();
            onChange({ photo: id });
            toast(t('Foto lista. Guarda los cambios para verla en las pantallas.'));
          }}
        />,
        document.body,
        )}
    </>
  );
}

type Phase = 'loading' | 'heic' | 'ready' | 'saving' | 'error';

/** The round crop. `onSave(id)` once the server has the photo. */
export function PhotoCropDialog({ file, color, onSave, onClose, onPickAnother }: {
  file: File;
  color: string;
  onSave: (id: string) => void;
  onClose: () => void;
  /** opens the file chooser again (the error screen's way out) */
  onPickAnother?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [src, setSrc] = useState<{ url: string; w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ cx: 0, cy: 0, zoom: 1 });
  const [view, setView] = useState(280);
  const work = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // the stage is `view` wide; the round window sits `pad` in from its edges and is `win` wide
  const pad = stagePad(view);
  const win = Math.max(60, view - 2 * pad);
  const live = useRef({ crop, src, win, pad });
  live.current = { crop, src, win, pad };

  // decode, turn upright, keep a copy no larger than WORK_SIDE
  useEffect(() => {
    let alive = true;
    let url = '';
    setPhase('loading');
    setErr('');
    (async () => {
      try {
        if (file.size > MAX_FILE_BYTES) throw new PhotoError('too-big');
        if (!looksLikeImage(file) && !isHeic(file)) throw new PhotoError('not-image');
        const img = await decodeImage(file, () => alive && setPhase('heic'));
        const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
        const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
        const k = Math.min(1, WORK_SIDE / Math.max(w0, h0));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w0 * k));
        c.height = Math.max(1, Math.round(h0 * k));
        const g = c.getContext('2d')!;
        // a transparent picture sits on a light tint of the member's colour (plain white looks off on dark screens)
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 0.28;
        g.fillStyle = /^#[0-9a-f]{6}$/i.test(color) ? color : '#888888';
        g.fillRect(0, 0, c.width, c.height);
        g.globalAlpha = 1;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        if ('close' in img) img.close();
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
        if (!blob) throw new PhotoError('decode');
        if (!alive) return;
        url = URL.createObjectURL(blob);
        work.current = c;
        setSrc({ url, w: c.width, h: c.height });
        setCrop(initialCrop(c.width, c.height));
        setPhase('ready');
      } catch (e) {
        if (!alive) return;
        const code = e instanceof PhotoError ? e.code : 'decode';
        setErr(t(PHOTO_ERRORS[code] ?? PHOTO_ERRORS.decode));
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      if (work.current) {
        work.current.width = 0;
        work.current.height = 0;
      }
    };
  }, [file]);

  // keyboard users land in the dialog: on the photo once it is ready, on "Elegir otra foto" after an error
  useEffect(() => {
    if (phase === 'ready' && document.activeElement !== stage.current && !box.current?.contains(document.activeElement)) {
      stage.current?.focus({ preventScroll: true });
    } else if (phase === 'error') {
      box.current?.closest('.modal')?.querySelector<HTMLElement>('.avatar-crop__again')?.focus({ preventScroll: true });
    }
  }, [phase]);

  // the window's size follows the dialog (phones)
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    // layout size (clientWidth), not the drawn one: the dialog opens with a small zoom animation
    const measure = () => setView(Math.max(120, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase === 'ready' || phase === 'saving']);

  // wheel zoom (needs a listener that may cancel the page scroll)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { src: s, crop: c, win: v, pad: p } = live.current;
      if (!s) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0015);
      setCrop(zoomTo(c, c.zoom * factor, s.w, s.h, v, e.clientX - r.left - p, e.clientY - r.top - p));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [phase === 'ready']);

  // drag with one pointer, pinch with two
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const onDown = (e: PointerEvent) => {
    if (!src || phase !== 'ready') return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.current;
    const prev = p.get(e.pointerId);
    if (!prev || !src) return;
    const r = stage.current!.getBoundingClientRect();
    if (p.size === 1) {
      setCrop((c) => panBy(c, e.clientX - prev.x, e.clientY - prev.y, src.w, src.h, win));
    } else if (p.size === 2) {
      const other = [...p.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const mx0 = (prev.x + other.x) / 2, my0 = (prev.y + other.y) / 2;
      const mx1 = (e.clientX + other.x) / 2, my1 = (e.clientY + other.y) / 2;
      setCrop((c) => {
        const z = d0 > 0 ? zoomTo(c, (c.zoom * d1) / d0, src.w, src.h, win, mx0 - r.left - pad, my0 - r.top - pad) : c;
        return panBy(z, mx1 - mx0, my1 - my0, src.w, src.h, win);
      });
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: PointerEvent) => void pointers.current.delete(e.pointerId);

  const onKey = (e: KeyboardEvent) => {
    if (!src) return;
    const step = e.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setCrop((c) => panBy(c, moves[e.key][0], moves[e.key][1], src.w, src.h, win));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setCrop((c) => zoomTo(c, c.zoom * 1.15, src.w, src.h, win));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setCrop((c) => zoomTo(c, c.zoom / 1.15, src.w, src.h, win));
    } else if (e.key === '0') {
      e.preventDefault();
      setCrop(initialCrop(src.w, src.h));
    }
  };

  const save = async () => {
    const c = work.current;
    if (!src || !c) return;
    setPhase('saving');
    try {
      const out = document.createElement('canvas');
      out.width = OUT_SIDE;
      out.height = OUT_SIDE;
      const g = out.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, OUT_SIDE, OUT_SIDE);
      g.imageSmoothingQuality = 'high';
      const { sx, sy, side } = cropRect(crop, src.w, src.h);
      g.drawImage(c, sx, sy, side, side, 0, 0, OUT_SIDE, OUT_SIDE);
      const data = out.toDataURL('image/jpeg', 0.88);
      out.width = 0;
      out.height = 0;
      const r = await api.familyPhoto(data);
      onSave(r.photo);
    } catch (e) {
      toast(uploadError(e), 'error');
      setPhase('ready');
    }
  };

  const shown = src ? placement(clampCrop(crop, src.w, src.h), src.w, src.h, win, pad) : null;
  // a crop moved away from the start asks before a stray tap on the backdrop throws it away
  const start = src ? initialCrop(src.w, src.h) : null;
  const dirty = !!start && (phase === 'ready' || phase === 'saving')
    && (Math.abs(crop.zoom - start.zoom) > 0.01 || Math.abs(crop.cx - start.cx) > 1 || Math.abs(crop.cy - start.cy) > 1);
  const pct = ((crop.zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
  const busy = phase === 'loading' || phase === 'heic';

  return (
    <Modal
      title={t('Foto de perfil')}
      icon="user"
      size="sm"
      onClose={onClose}
      autoFocus={false}
      dirty={dirty}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          {phase === 'error' && onPickAnother ? (
            <Button variant="primary" icon="upload" class="avatar-crop__again" onClick={onPickAnother}>
              {t('Elegir otra foto')}
            </Button>
          ) : (
            <Button variant="primary" icon="check" loading={phase === 'saving'} disabled={phase !== 'ready' && phase !== 'saving'} onClick={() => void save()}>
              {t('Guardar')}
            </Button>
          )}
        </>
      }
    >
      <div class="avatar-crop" ref={box} style={{ '--mc': color, '--pad': `${pad}px` } as any}>
        {phase === 'error' ? (
          <div class="avatar-crop__error" role="alert">
            <Icon name="alert" size={22} />
            <p>{err}</p>
          </div>
        ) : busy ? (
          <div class="avatar-crop__stage is-loading" aria-live="polite">
            <span class="spinner" />
            <span class="muted small">{phase === 'heic' ? t('Convirtiendo la foto HEIC…') : t('Abriendo la foto…')}</span>
          </div>
        ) : (
          <>
            <div
              ref={stage}
              class="avatar-crop__stage"
              tabIndex={0}
              role="group"
              aria-label={t('Encuadre de la foto: arrastra o usa las flechas para moverla, y + o − para acercarla.')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
            >
              {src && shown && (
                <img
                  src={src.url}
                  alt=""
                  draggable={false}
                  style={{ width: `${shown.width}px`, height: `${shown.height}px`, transform: `translate(${shown.x}px, ${shown.y}px)` }}
                />
              )}
              <span class="avatar-crop__ring" aria-hidden="true" />
            </div>
            <div class="avatar-crop__zoom slider">
              <Icon name="image" size={14} />
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={crop.zoom}
                aria-label={t('Zoom')}
                style={{ '--pct': `${pct}%` } as any}
                onInput={(e) => src && setCrop((c) => zoomTo(c, parseFloat(e.currentTarget.value), src.w, src.h, win))}
              />
              <Icon name="image" size={20} />
            </div>
            <p class="muted small avatar-crop__hint">{t('Arrastra para encuadrar la cara y acerca con la barra.')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
