// Carousels ("Carruseles"): several screens shown one after another on the same TV, each for as long as you choose.
// Global (not per screen). Every TV on the same carousel changes screen at the same moment (server/core/carousels.js).
import { useEffect, useState } from 'preact/hooks';
import type { Carousel, StoredConfig } from '../../shared/types';
import { slugify } from '../../shared/screens';
import {
  carouselBlock, carouselPhase, cycleMs, DEFAULT_STEP_SEC, MAX_CAROUSEL_STEPS, MAX_STEP_SEC, MIN_STEP_SEC,
} from '../../shared/carousels';
import { openPairDialog, shareOrigin } from '../components/DisplayAccess';
import { confirmDialog, toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { LimitNote } from '../components/LimitNote';
import { Button, Callout, Card, Empty, Field, Modal, NumberInput, PageHeader, ReorderButtons, Select, TextInput, Toggle, ToggleRow } from '../components/ui';
import { atLimit, limit } from '../caps';
import { screenHref, useDisplayLinks } from '../displayLinks';
import { t } from '../i18n';
import { Preview } from '../Preview';
import { clone, moveItem, uid } from '../util';
import { ScheduleRulesEditor } from './Privacy';
import type { SectionProps } from './common';

const CHIPS: [number, string][] = [[15, '15 s'], [30, '30 s'], [60, '1 min'], [300, '5 min']];

/** "1 h 5 min", "1 min 20 s", "45 s" (the same units in every language). */
export function formatCycle(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  return [h ? `${h} h` : '', m ? `${m} min` : '', s || (!h && !m) ? `${s} s` : ''].filter(Boolean).join(' ');
}

function uniqueSlug(base: string, taken: Set<string>) {
  let s = slugify(base) || 'carrusel';
  for (let i = 2, b = s; taken.has(s); i++) s = `${b.slice(0, 29)}-${i}`;
  return s;
}

const takenSlugs = (full: StoredConfig, exceptId = '') =>
  new Set([...full.screens.map((s) => s.slug), ...(full.carousels?.items ?? []).filter((c) => c.id !== exceptId).map((c) => c.slug)]);

function NewCarouselDialog({ full, onClose, onCreate }: { full: StoredConfig; onClose: () => void; onCreate: (c: Carousel) => void }) {
  const [name, setName] = useState('');
  const slug = uniqueSlug(name || t('carrusel'), takenSlugs(full));
  const create = (e?: Event) => {
    e?.preventDefault();
    if (!name.trim()) return;
    onCreate({
      id: uid('v'),
      enabled: true,
      name: name.trim().slice(0, 40),
      slug,
      transition: 'fade',
      holdOnAlert: true,
      nightRotate: false,
      offScreenId: null,
      schedule: [],
      steps: full.screens.slice(0, MAX_CAROUSEL_STEPS).map((s) => ({ screenId: s.id, seconds: DEFAULT_STEP_SEC })),
    });
  };
  return (
    <Modal
      title={t('Nuevo carrusel')}
      icon="repeat"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button variant="primary" icon="plus" disabled={!name.trim()} onClick={create}>
            {t('Crear carrusel')}
          </Button>
        </>
      }
    >
      <form class="stack" onSubmit={create}>
        <Field label={t('Nombre')} hint={name ? `${t('Dirección')}: /?screen=${slug}` : t('Por ejemplo: Cocina en bucle')}>
          <TextInput value={name} onValue={setName} placeholder={t('Cocina en bucle')} maxLength={40} />
        </Field>
        <p class="muted small">{t('Empieza con todas tus pantallas, 30 s cada una. Luego cambias el orden, el tiempo y el horario.')}</p>
      </form>
    </Modal>
  );
}

/** "Ahora: Cocina · cambia en 12 s", recomputed every second with the same clock the TVs use. */
function NowShowing({ full, c }: { full: StoredConfig; c: Carousel }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const block = carouselBlock(full, c);
  const now = Date.now();
  const ph = carouselPhase(block, now, { tz: full.datetime.timezone });
  const name = full.screens.find((s) => s.id === ph.screenId)?.name ?? '–';
  const left = ph.endsAt ? Math.max(0, Math.round((ph.endsAt - now) / 1000)) : null;
  const what =
    ph.mode === 'off'
      ? t('Fuera de horario')
      : ph.mode === 'paused'
        ? t('En pausa')
        : left !== null
          ? t('cambia en {d}', { d: formatCycle(left) })
          : '';
  return (
    <div class="car-now">
      <span class="live-dot" />
      <span>
        {t('Ahora: {name}', { name })}
        {what && <span class="muted"> · {what}</span>}
      </span>
      {c.nightRotate ? null : <span class="muted small car-now__night">{t('De noche se queda en una pantalla')}</span>}
    </div>
  );
}

function PreviewDialog({ url, openUrl, name, onClose }: { url: string | null; openUrl: string | null; name: string; onClose: () => void }) {
  return (
    <Modal title={t('Vista previa')} icon="eye" size="xl" onClose={onClose} autoFocus={false}>
      <Preview variant="sheet" saved url={url} openUrl={openUrl} screenName={name} reloadKey={0} portrait={false} />
    </Modal>
  );
}

export function CarouselsSection({ full, setFull, saved, errors, go, dirty, save }: SectionProps) {
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Carousel | null>(null);
  const openMode = saved.security?.displayAccess === 'open';
  const linkState = useDisplayLinks(saved);
  const links = linkState.data;
  const origin = openMode ? location.origin : shareOrigin(links) || location.origin;
  const items = full.carousels?.items ?? [];
  const screens = full.screens;
  const screenName = (id: string) => screens.find((s) => s.id === id)?.name ?? t('(pantalla borrada)');

  const upd = (id: string, fn: (c: Carousel) => void) =>
    setFull((d) => {
      const c = d.carousels?.items.find((x) => x.id === id);
      if (c) fn(c);
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Copiado'), 'ok', 1500);
    } catch {
      toast(text, 'info', 6000);
    }
  };

  const remove = async (c: Carousel) => {
    const ok = await confirmDialog({
      title: t('Eliminar el carrusel “{name}”', { name: c.name }),
      body: <p>{t('Sus pantallas no se tocan. Las teles que lo muestran pasarán a la pantalla predeterminada y su enlace privado dejará de funcionar.')}</p>,
      confirm: t('Eliminar'),
      danger: true,
    });
    if (!ok) return;
    setFull((d) => {
      if (d.carousels) d.carousels.items = d.carousels.items.filter((x) => x.id !== c.id);
    });
  };

  const duplicate = (c: Carousel) => {
    if (atLimit('carousels', items.length)) return toast(t('Máximo {n} carruseles', { n: limit('carousels') ?? items.length }), 'error');
    const n = clone(c);
    n.id = uid('v');
    n.name = t('{name} (copia)', { name: c.name }).slice(0, 40);
    n.slug = uniqueSlug(n.name, takenSlugs(full));
    setFull((d) => {
      d.carousels = d.carousels ?? { items: [] };
      d.carousels.items.splice(d.carousels.items.findIndex((x) => x.id === c.id) + 1, 0, n);
    });
  };

  const screenOptions = screens.map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <PageHeader
        title={t('Carruseles')}
        scope="global"
        desc={t('Muestra varias pantallas en bucle en el mismo televisor, cada una el tiempo que elijas. Todas las teles con el mismo carrusel cambian a la vez.')}
      >
        <Button variant="primary" icon="plus" disabled={atLimit('carousels', items.length) || screens.length < 2} onClick={() => setCreating(true)}>
          {t('Nuevo carrusel')}
        </Button>
      </PageHeader>
      <LimitNote name="carousels" count={items.length} />

      {items.length === 0 ? (
        <Card>
          <Empty icon="repeat" title={t('Ningún carrusel todavía')}>
            {screens.length < 2 ? (
              <>
                {t('Para un carrusel necesitas al menos dos pantallas.')}{' '}
                <button type="button" class="link-btn" onClick={() => go('screens')}>
                  {t('Crear otra pantalla')}
                </button>
              </>
            ) : (
              t('Un carrusel pasa por tus pantallas en bucle: por ejemplo el calendario un minuto y las fotos veinte segundos.')
            )}
          </Empty>
        </Card>
      ) : (
        <div class="screen-cards" id="car-list">
          {items.map((c, i) => {
            const isNew = !saved.carousels?.items.some((x) => x.id === c.id);
            const err = (k: string) => errors[`car.${c.id}.${k}`];
            const total = cycleMs(c.steps.filter((st) => screens.some((s) => s.id === st.screenId))) / 1000;
            const link = links?.links.find((l) => l.screenId === c.id);
            const savedSlug = saved.carousels?.items.find((x) => x.id === c.id)?.slug;
            const url = openMode ? (savedSlug ? `${origin}/?screen=${savedSlug}` : '') : link ? `${origin}${link.path}` : '';
            const first = screens.find((s) => s.id === c.steps[0]?.screenId);
            const offOptions = [{ value: '', label: t('La primera del carrusel ({name})', { name: first?.name ?? '–' }) }, ...screenOptions];
            return (
              <section class={`screen-card car-card ${c.enabled ? '' : 'is-off'}`} key={c.id}>
                <div class="screen-card__body">
                  <div class="screen-card__head">
                    <Icon name="repeat" size={18} />
                    <TextInput class="screen-card__name" value={c.name} maxLength={40} onValue={(v) => upd(c.id, (x) => void (x.name = v))} error={!!err('name')} />
                    <label class="mini-toggle">
                      <Toggle checked={c.enabled} onChange={(v) => upd(c.id, (x) => void (x.enabled = v))} />
                      <span>{c.enabled ? t('Activo') : t('En pausa')}</span>
                    </label>
                    {isNew && <span class="badge badge--soft">{t('Nuevo')}</span>}
                  </div>

                  {openMode ? (
                    <div class="screen-card__slug">
                      <TextInput
                        mono
                        class="input--sm"
                        value={c.slug}
                        error={!!err('slug')}
                        prefix={<span class="mono small">?screen=</span>}
                        onValue={(v) => upd(c.id, (x) => void (x.slug = v.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32)))}
                      />
                      <button type="button" class="icon-btn" title={t('Generar desde el nombre')} onClick={() => upd(c.id, (x) => void (x.slug = uniqueSlug(x.name, takenSlugs(full, c.id))))}>
                        <Icon name="wand" size={15} />
                      </button>
                      <button type="button" class="icon-btn" title={t('Copiar URL')} disabled={!url} onClick={() => copy(url)}>
                        <Icon name="copy" size={15} />
                      </button>
                    </div>
                  ) : (
                    <div class="screen-card__slug screen-card__link">
                      <input
                        class="input input--mono input--sm"
                        value={url}
                        readOnly
                        spellcheck={false}
                        aria-label={t('Enlace privado')}
                        placeholder={isNew ? t('Guarda el carrusel para obtener su enlace privado.') : t('Cargando el enlace…')}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button type="button" class="btn btn--sm btn--ghost" disabled={!url} onClick={() => copy(url)}>
                        <Icon name="copy" size={15} /> {t('Copiar')}
                      </button>
                    </div>
                  )}
                  {err('slug') && <div class="field__error">{t(err('slug')!)}</div>}

                  <div>
                    <h4 class="privacy-sub">{t('Pantallas')}</h4>
                    {err('steps') && <div class="field__error">{t(err('steps')!)}</div>}
                    <ol class="car-steps">
                      {c.steps.map((st, j) => {
                        const bad = err(`step${j}.seconds`);
                        return (
                          <li class="car-step" key={`${j}-${st.screenId}`}>
                            <span class="car-step__n">{j + 1}</span>
                            <div class="car-step__screen">
                              <Select
                                value={st.screenId}
                                options={screens.some((s) => s.id === st.screenId) ? screenOptions : [{ value: st.screenId, label: screenName(st.screenId) }, ...screenOptions]}
                                onChange={(v) => upd(c.id, (x) => void (x.steps[j].screenId = v))}
                              />
                            </div>
                            <div class="car-step__secs">
                              <NumberInput value={st.seconds} min={MIN_STEP_SEC} max={MAX_STEP_SEC} suffix="s" error={!!bad} onValue={(v) => upd(c.id, (x) => void (x.steps[j].seconds = Math.round(v)))} />
                            </div>
                            <div class="quick-add car-step__chips">
                              {CHIPS.map(([sec, label]) => (
                                <button type="button" class={`pill ${st.seconds === sec ? 'is-on' : ''}`} onClick={() => upd(c.id, (x) => void (x.steps[j].seconds = sec))}>
                                  {label}
                                </button>
                              ))}
                            </div>
                            <span class="car-step__tail">
                              <ReorderButtons index={j} count={c.steps.length} onMove={(a, b) => upd(c.id, (x) => void (x.steps = moveItem(x.steps, a, b)))} />
                              <button type="button" class="icon-btn icon-btn--danger" title={t('Quitar')} onClick={() => upd(c.id, (x) => void x.steps.splice(j, 1))}>
                                <Icon name="trash" size={15} />
                              </button>
                            </span>
                            {bad && <div class="field__error car-step__err">{t(bad)}</div>}
                          </li>
                        );
                      })}
                    </ol>
                    <div class="car-steps__foot">
                      {c.steps.length < MAX_CAROUSEL_STEPS && (
                        <Button
                          size="sm"
                          icon="plus"
                          onClick={() =>
                            upd(c.id, (x) => {
                              const next = screens.find((s) => !x.steps.some((y) => y.screenId === s.id)) ?? screens[0];
                              x.steps.push({ screenId: next.id, seconds: DEFAULT_STEP_SEC });
                            })
                          }
                        >
                          {t('Añadir pantalla')}
                        </Button>
                      )}
                      {total > 0 && <span class="muted small">{t('Ciclo completo: {d}', { d: formatCycle(total) })}</span>}
                    </div>
                  </div>

                  {c.enabled && c.steps.length > 0 && <NowShowing full={full} c={c} />}

                  <div class="grid grid--2">
                    <Field label={t('Transición')}>
                      <Select
                        value={c.transition}
                        options={[
                          { value: 'fade', label: t('Fundido') },
                          { value: 'none', label: t('Sin transición') },
                        ]}
                        onChange={(v) => upd(c.id, (x) => void (x.transition = v))}
                      />
                    </Field>
                    <Field label={t('Fuera de horario, mostrar')} hint={c.schedule.length ? undefined : t('Solo cuenta si añades un horario.')}>
                      <Select value={c.offScreenId ?? ''} options={offOptions} onChange={(v) => upd(c.id, (x) => void (x.offScreenId = v || null))} />
                    </Field>
                  </div>
                  <ToggleRow
                    label={t('Pausar con timbre y avisos')}
                    hint={t('Mientras se ve el timbre o un aviso grande, no cambia de pantalla. Después vuelve al paso que toca.')}
                    checked={c.holdOnAlert}
                    onChange={(v) => upd(c.id, (x) => void (x.holdOnAlert = v))}
                  />
                  <ToggleRow
                    label={t('Seguir rotando de noche')}
                    hint={
                      c.nightRotate
                        ? t('De noche sigue cambiando; cada pantalla usa su propio modo noche.')
                        : t('Con el modo noche activo se queda en la pantalla de fuera de horario, con su modo noche, para que la luz no cambie.')
                    }
                    checked={c.nightRotate}
                    onChange={(v) => upd(c.id, (x) => void (x.nightRotate = v))}
                  />

                  <div>
                    <h4 class="privacy-sub">{t('Horario')}</h4>
                    <p class="muted small privacy-note">
                      {c.schedule.length
                        ? t('Rota solo en estas franjas. Fuera de ellas muestra la pantalla elegida arriba.')
                        : t('Sin franjas rota siempre. Añade una para que solo rote a ciertas horas.')}
                    </p>
                  </div>
                  <ScheduleRulesEditor
                    rules={c.schedule}
                    update={(fn) => upd(c.id, (x) => fn(x.schedule))}
                    errorOf={(r) => err(`sched.${r.id}.to`)}
                    newFrom="07:00"
                    newTo="22:00"
                  />

                  <div class="screen-card__actions">
                    <Button size="sm" icon="eye" disabled={isNew} title={isNew ? t('Guarda para previsualizar este carrusel') : undefined} onClick={() => setPreview(c)}>
                      {t('Vista previa')}
                    </Button>
                    {!isNew && screenHref(saved, c.id, linkState) && (
                      <a class="btn btn--ghost btn--sm" href={screenHref(saved, c.id, linkState)!} target="_blank" rel="noopener">
                        <Icon name="external" size={15} />
                        <span>{t('Abrir')}</span>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" icon="copy" disabled={atLimit('carousels', items.length)} onClick={() => duplicate(c)}>
                      {t('Duplicar')}
                    </Button>
                    <span class="screen-card__tail">
                      <ReorderButtons index={i} count={items.length} onMove={(a, b) => setFull((d) => void (d.carousels && (d.carousels.items = moveItem(d.carousels.items, a, b))))} />
                      <button type="button" class="icon-btn icon-btn--danger" title={t('Eliminar')} onClick={() => remove(c)}>
                        <Icon name="trash" size={16} />
                      </button>
                    </span>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {dirty && items.some((c) => !saved.carousels?.items.some((x) => x.id === c.id)) && (
        <Callout kind="info">
          {t('Los carruseles nuevos existen cuando guardes.')}{' '}
          <button type="button" class="link-btn" onClick={() => save()}>
            {t('Guardar ahora')}
          </button>
        </Callout>
      )}

      <Card title={t('Cómo poner un carrusel en una tele')} icon="info" muted={false}>
        <ol class="howto">
          {openMode ? (
            <li>
              {t('Abre en el dispositivo')} <code>{origin}/?screen=</code>
              {t('y la dirección del carrusel, igual que con una pantalla.')}
            </li>
          ) : (
            <li>{t('Abre en el dispositivo el enlace privado del carrusel (botón copiar de arriba).')}</li>
          )}
          <li>
            {t('O vincula el dispositivo con un código y elige el carrusel en «Qué mostrará»:')}{' '}
            <button type="button" class="link-btn" onClick={() => openPairDialog()}>
              {t('Vincular una pantalla')}
            </button>
            .
          </li>
          <li>
            {t('En la Raspberry Pi pon esa dirección en')} <code>KIOSK_URL</code> {t('en')} <code>~/.config/marco/kiosk.env</code> {t('y reinicia el kiosco.')}
          </li>
          <li>
            {t('Para probar un paso: añade')} <code>&step=</code>
            {t('y la dirección de una pantalla, o')} <code>&carousel=0</code> {t('para quedarte en la primera.')}
          </li>
        </ol>
      </Card>

      {creating && (
        <NewCarouselDialog
          full={full}
          onClose={() => setCreating(false)}
          onCreate={(c) => {
            if (atLimit('carousels', items.length)) return toast(t('Máximo {n} carruseles', { n: limit('carousels') ?? items.length }), 'error');
            setFull((d) => {
              d.carousels = d.carousels ?? { items: [] };
              d.carousels.items.push(c);
            });
            setCreating(false);
            toast(t('Carrusel “{name}” creado · guarda para aplicar', { name: c.name }), 'ok');
          }}
        />
      )}
      {preview && (
        <PreviewDialog
          name={preview.name}
          url={screenHref(saved, preview.id, linkState, { preview: true })}
          openUrl={screenHref(saved, preview.id, linkState)}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

