import { useEffect, useRef, useState } from 'preact/hooks';
import type { BackupInfo, ImportPreview } from '../../shared/types';
import { api, ApiError, downloadJson } from '../api';
import { confirmDialog, toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Callout, Card, Empty, PageHeader, Toggle } from '../components/ui';
import { fmtDateTime } from '../dates';
import { relTime, nScreens, t } from '../i18n';
import { takeIntent } from '../intent';
import { sectionLabel } from '../activityText';
import { formatBytes } from '../util';
import type { SectionProps } from './common';

const REASON: Record<string, string> = { save: 'Al guardar', manual: 'Manual', restore: 'Antes de restaurar', import: 'Antes de importar', migration: 'Migración v1' };

export function BackupsSection({ dirty, replaceConfig }: SectionProps) {
  const [secrets, setSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [list, setList] = useState<BackupInfo[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [bundle, setBundle] = useState<unknown>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [impSecrets, setImpSecrets] = useState(false);
  const [busy, setBusy] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      setList(await api.backups());
      setListErr('');
    } catch (e) {
      setList([]);
      setListErr((e as ApiError).message);
    }
  };
  useEffect(() => {
    load();
    if (takeIntent('backups', 'export')) setTimeout(() => doExport(), 200);
    if (takeIntent('backups', 'backup')) setTimeout(() => createNow(), 200);
  }, []);

  const doExport = async () => {
    setExporting(true);
    try {
      const b = await api.exportConfig(secrets);
      const day = new Date().toISOString().slice(0, 10);
      downloadJson(b, `marco-${day}${secrets ? '-secrets' : ''}.json`);
      toast(t('Copia descargada'));
    } catch (e) {
      toast(`${t('No se pudo exportar')}: ${(e as ApiError).message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const createNow = async () => {
    setCreating(true);
    try {
      await api.createBackup();
      toast(t('Copia de seguridad creada'));
      load();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const readFile = async (f: File) => {
    setPreview(null);
    setBundle(null);
    setFileName(f.name);
    if (f.size > 5 * 1024 * 1024) return toast(t('El archivo es demasiado grande (máx. 5 MB)'), 'error');
    let data: unknown;
    try {
      data = JSON.parse(await f.text());
    } catch {
      return toast(t('El archivo no es un JSON válido'), 'error');
    }
    setBundle(data);
    setBusy('preview');
    try {
      const p = await api.importPreview(data);
      setPreview(p);
      setSections(p.sections.filter((s) => s.changed).map((s) => s.key));
      setImpSecrets(false);
    } catch (e) {
      toast(`${t('No se pudo analizar')}: ${(e as ApiError).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const apply = async () => {
    if (!preview || !bundle) return;
    const all = preview.sections.length === sections.length;
    const ok = await confirmDialog({
      title: t('¿Importar esta configuración?'),
      body: (
        <>
          <p>{all ? t('Se reemplazará toda la configuración actual.') : t('Se reemplazarán: {list}.', { list: sections.map(sectionLabel).join(', ') })}</p>
          <p class="muted small">{t('Antes se guarda una copia automática de la configuración actual.')}</p>
          {dirty && <p class="err-text">{t('Perderás los cambios sin guardar.')}</p>}
          {impSecrets && <p class="err-text">{t('Si la copia trae otra contraseña, se cerrarán todas las sesiones.')}</p>}
        </>
      ),
      confirm: t('Importar'),
      danger: true,
    });
    if (!ok) return;
    setBusy('apply');
    try {
      const r = await api.importApply({ bundle, includeSecrets: impSecrets, sections: all ? undefined : sections });
      if (r.loggedOut) {
        toast(t('Importado. La contraseña ha cambiado: vuelve a entrar.'), 'info');
        setTimeout(() => location.reload(), 1500);
        return;
      }
      replaceConfig(r.config);
      setPreview(null);
      setBundle(null);
      setFileName('');
      toast(t('Configuración importada'));
      load();
    } catch (e) {
      toast(`${t('No se pudo importar')}: ${(e as ApiError).message}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const restore = async (b: BackupInfo) => {
    const ok = await confirmDialog({
      title: t('¿Restaurar la copia del {date}?', { date: fmtDateTime(b.createdAt) }),
      body: (
        <>
          <p>{t('La configuración actual se reemplazará (antes se guarda una copia).')}</p>
          {dirty && <p class="err-text">{t('Perderás los cambios sin guardar.')}</p>}
        </>
      ),
      confirm: t('Restaurar'),
      danger: true,
    });
    if (!ok) return;
    setBusy(`r-${b.id}`);
    try {
      const r = await api.restoreBackup(b.id);
      replaceConfig(r.config);
      if (r.repaired?.length) toast(t('Copia restaurada · se corrigieron {n} valores no válidos (ver Actividad)', { n: r.repaired.length }), 'info', 6000);
      else toast(t('Copia restaurada · las pantallas se actualizan solas'));
      load();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const remove = async (b: BackupInfo) => {
    if (!(await confirmDialog({ title: t('¿Eliminar esta copia?'), confirm: t('Eliminar'), danger: true }))) return;
    try {
      await api.deleteBackup(b.id);
      load();
    } catch (e) {
      toast((e as ApiError).message, 'error');
    }
  };

  const diffList = (label: string, d: { added: string[]; removed: string[]; changed: string[] }) =>
    d.added.length + d.removed.length + d.changed.length > 0 && (
      <div class="diff-block">
        <strong class="small">{label}</strong>
        <div class="diff-chips">
          {d.added.map((x) => (
            <span class="diff diff--add">+ {x}</span>
          ))}
          {d.removed.map((x) => (
            <span class="diff diff--del">− {x}</span>
          ))}
          {d.changed.map((x) => (
            <span class="diff diff--chg">~ {x}</span>
          ))}
        </div>
      </div>
    );

  return (
    <>
      <PageHeader title={t('Copias de seguridad')} desc={t('Exporta toda la configuración a un archivo, impórtala en otra instalación o vuelve a una versión anterior.')} />

      <Card title={t('Exportar')} icon="download" id="bk-export" desc={t('Pantallas, calendarios, cumpleaños, filtros, avisos programados… en un archivo JSON.')}>
        <label class="mini-toggle">
          <Toggle checked={secrets} onChange={setSecrets} />
          <span>{t('Incluir secretos (contraseña cifrada, token de Home Assistant, cuentas de Google, tokens de API)')}</span>
        </label>
        {secrets && <Callout kind="warn">{t('Con secretos, quien tenga el archivo podría acceder a tus calendarios de Google y a Home Assistant. Guárdalo en un lugar seguro.')}</Callout>}
        <div>
          <Button variant="primary" icon="download" loading={exporting} onClick={doExport}>
            {t('Descargar copia')}
          </Button>
        </div>
      </Card>

      <Card title={t('Importar')} icon="upload" id="bk-import">
        <div
          class={`dropzone dropzone--sm ${drag ? 'is-drag' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer?.files?.[0];
            if (f) readFile(f);
          }}
        >
          <span class="dropzone__icon">{busy === 'preview' ? <span class="spinner" /> : <Icon name="upload" size={20} />}</span>
          <div>
            <strong>{fileName || t('Elige o arrastra un archivo .json')}</strong>
            <div class="muted small">{t('Copias exportadas desde aquí o un config.json (también del formato antiguo).')}</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) readFile(f);
              e.currentTarget.value = '';
            }}
          />
        </div>
        {preview && (
          <div class="import-prev">
            <div class="import-prev__head">
              {preview.ok ? (
                <span class="ok-text">
                  <Icon name="check" size={15} /> {t('Archivo válido')}
                </span>
              ) : (
                <span class="err-text">
                  <Icon name="alert" size={15} /> {t('{n} errores de validación', { n: preview.errors.length })}
                </span>
              )}
              <span class="muted small">
                {preview.fromVersion === 1 ? t('formato antiguo (v1), se migrará') : 'v2'}
                {preview.appVersion && ` · app ${preview.appVersion}`}
                {preview.exportedAt && ` · ${t('exportada {when}', { when: fmtDateTime(preview.exportedAt) })}`}
              </span>
            </div>
            {!preview.ok && (
              <ul class="import-prev__errs">
                {preview.errors.slice(0, 8).map((e) => (
                  <li>
                    <code>{e.path}</code> {e.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.ok && (
              <>
                <div class="import-sections">
                  {preview.sections.map((s) => {
                    const on = sections.includes(s.key);
                    return (
                      <label class={`import-sec ${s.changed ? '' : 'is-same'} ${on ? 'is-on' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => setSections(on ? sections.filter((x) => x !== s.key) : [...sections, s.key])} />
                        <span class="check-box">
                          <Icon name="check" size={12} />
                        </span>
                        <span class="import-sec__name">{sectionLabel(s.key)}</span>
                        <span class="import-sec__sum muted small">{s.summary}</span>
                      </label>
                    );
                  })}
                </div>
                {diffList(t('Pantallas'), preview.screens)}
                {diffList(t('Calendarios'), preview.sources)}
                <div class="muted small">
                  {t('Contiene')}: {t('{n} eventos locales', { n: preview.counts.localEvents })} · {t('{n} cumpleaños', { n: preview.counts.birthdays })} · {t('{n} reglas', { n: preview.counts.eventRules })} · {t('{n} cuentas atrás', { n: preview.counts.countdowns })} · {t('{n} mensajes programados', { n: preview.counts.schedules })}
                </div>
                {(() => {
                  const o = preview.orphanSchedules;
                  const list = sections.includes('screens') && !sections.includes('schedules') ? o?.screensOnly
                    : sections.includes('schedules') && !sections.includes('screens') ? o?.schedulesOnly : null;
                  return list?.length ? (
                    <p class="err-text small">
                      {t('Estos mensajes programados se quedarán sin pantallas y se desactivarán: {list}. Importa también «Pantallas» y «Mensajes programados» juntos para conservarlos.', { list: list.join(', ') })}
                    </p>
                  ) : null;
                })()}
                {preview.hasSecrets && (
                  <label class="mini-toggle">
                    <Toggle checked={impSecrets} onChange={setImpSecrets} />
                    <span>{t('Importar también los secretos que trae la copia')}</span>
                  </label>
                )}
                <div class="btn-row">
                  <Button variant="ghost" onClick={() => (setPreview(null), setBundle(null), setFileName(''))}>
                    {t('Cancelar')}
                  </Button>
                  <Button variant="primary" icon="upload" loading={busy === 'apply'} disabled={!sections.length} onClick={apply}>
                    {t('Importar {n} secciones', { n: sections.length })}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card
        title={t('Copias automáticas')}
        icon="archive"
        id="bk-auto"
        desc={t('Se crea una copia cada vez que guardas (se conservan las 20 últimas).')}
        actions={
          <Button size="sm" icon="plus" loading={creating} onClick={createNow}>
            {t('Crear copia ahora')}
          </Button>
        }
      >
        {listErr && <Callout kind="error">{listErr}</Callout>}
        {list === null ? (
          <div class="skeleton-list">
            <div class="skeleton" />
            <div class="skeleton" />
          </div>
        ) : list.length === 0 ? (
          <Empty icon="archive" title={t('Todavía no hay copias')}>
            {t('Aparecerán aquí cuando guardes cambios.')}
          </Empty>
        ) : (
          <ul class="bk-list">
            {list.map((b, i) => (
              <li class="bk">
                <span class={`bk__icon bk__icon--${b.reason}`}>
                  <Icon name={b.reason === 'manual' ? 'star' : b.reason === 'save' ? 'check' : b.reason === 'migration' ? 'wand' : 'history'} size={14} />
                </span>
                <div class="bk__main">
                  <strong>
                    {fmtDateTime(b.createdAt)} <span class="muted small">· {relTime(b.createdAt)}</span>
                    {i === 0 && <span class="badge badge--soft">{t('la más reciente')}</span>}
                  </strong>
                  <span class="muted small">
                    {t(REASON[b.reason] ?? b.reason)} · {t('revisión {n}', { n: b.revision })} · {nScreens(b.screens)} · {t('{n} calendarios', { n: b.sources })} · {formatBytes(b.size)}
                  </span>
                </div>
                <div class="bk__actions">
                  <a class="icon-btn" href={api.backupUrl(b.id)} download title={t('Descargar')}>
                    <Icon name="download" size={15} />
                  </a>
                  <Button size="sm" variant="ghost" icon="history" loading={busy === `r-${b.id}`} onClick={() => restore(b)}>
                    {t('Restaurar')}
                  </Button>
                  {b.reason !== 'migration' && (
                    <button type="button" class="icon-btn icon-btn--danger" title={t('Eliminar')} onClick={() => remove(b)}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
