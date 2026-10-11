import { useEffect, useState } from 'preact/hooks';
import type { ImmichAlbum, ImmichKeyStatus, ImmichStatus, TestImmichResponse } from '../../shared/types';
import { api, ApiError } from '../api';
import { toast } from '../components/feedback';
import { Icon } from '../components/icons';
import { Button, Callout, Card, Empty, Field, PageHeader, TextInput, ToggleRow } from '../components/ui';
import { t } from '../i18n';
import { formatBytes } from '../util';
import type { SectionProps } from './common';

export const IMMICH_SCOPES = 'album.read, asset.read, asset.view';
const DEFAULT_IMMICH = { enabled: false, url: '', insecureTls: false };

/** Text for an Immich error code (server/immich.js). */
export function immichErrorText(code: string | undefined): string {
  switch (code) {
    case 'not_configured':
      return t('Immich no está configurado');
    case 'key_missing':
      return t('Falta la clave de API');
    case 'invalid_url':
      return t('URL no válida');
    case 'invalid_key':
      return t('Clave no válida');
    case 'missing_scope':
      return t('A la clave le faltan permisos: {scopes}', { scopes: IMMICH_SCOPES });
    default:
      return t('No se pudo conectar con Immich');
  }
}

const errorCode = (e: unknown): string => {
  const b = (e as ApiError)?.body as { error?: unknown } | undefined;
  return typeof b?.error === 'string' ? b.error : '';
};

/** Album cover thumbnail (proxied by the server, admin session only). */
export function AlbumCover({ album }: { album: ImmichAlbum }) {
  const [failed, setFailed] = useState(false);
  if (!album.cover || failed) {
    return (
      <span class="immich-album__cover immich-album__cover--empty">
        <Icon name="image" size={18} />
      </span>
    );
  }
  return <img class="immich-album__cover" src={`/media/immich/${album.cover}?s=thumb`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function ImmichSection({ cfg, set, errors }: SectionProps) {
  const im = cfg.immich ?? DEFAULT_IMMICH;
  const [keyStatus, setKeyStatus] = useState<ImmichKeyStatus | null>(null);
  const [key, setKey] = useState('');
  const [editKey, setEditKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [test, setTest] = useState<{ loading: boolean; res?: TestImmichResponse }>({ loading: false });
  const [status, setStatus] = useState<ImmichStatus | null>(null);
  const [albums, setAlbums] = useState<ImmichAlbum[] | null>(null);
  const [albumsError, setAlbumsError] = useState('');
  const [busy, setBusy] = useState<'' | 'refresh' | 'cache'>('');

  const loadAlbums = () => {
    setAlbumsError('');
    api.immichAlbums().then(setAlbums, (e) => {
      setAlbums([]);
      setAlbumsError(errorCode(e) || 'unreachable');
    });
  };
  useEffect(() => {
    api.immichKey().then(setKeyStatus).catch(() => setKeyStatus(null));
    api.immichStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  // the server reads the saved settings: list the albums once Immich is saved as usable
  useEffect(() => {
    if (status?.usable) loadAlbums();
  }, [status?.usable]);

  const saveKey = async (value: string) => {
    setSavingKey(true);
    try {
      const st = await api.setImmichKey(value);
      setKeyStatus(st);
      setKey('');
      setEditKey(false);
      toast(value ? t('Clave guardada') : t('Clave quitada'));
      api.immichStatus().then(setStatus).catch(() => {});
    } catch (e) {
      toast(errorCode(e) === 'invalid_key' ? t('Clave no válida') : t('No se pudo guardar la clave.'), 'error');
    } finally {
      setSavingKey(false);
    }
  };
  const runTest = async () => {
    setTest({ loading: true });
    try {
      const body: { url?: string; key?: string; insecureTls?: boolean } = { url: im.url.trim(), insecureTls: im.insecureTls };
      if (key.trim()) body.key = key.trim();
      setTest({ loading: false, res: await api.testImmich(body) });
    } catch (e) {
      setTest({ loading: false, res: { ok: false, error: errorCode(e) || 'unreachable' } });
    }
  };
  const refresh = async () => {
    setBusy('refresh');
    try {
      setStatus(await api.refreshImmich());
      loadAlbums();
      toast(t('Álbumes actualizados'));
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy('');
    }
  };
  const clearCache = async () => {
    setBusy('cache');
    try {
      await api.clearImmichCache();
      setStatus(await api.immichStatus());
      toast(t('Caché vaciada'));
    } catch (e) {
      toast((e as ApiError).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const inUse = new Map((status?.albums ?? []).map((a) => [a.id, a]));
  const res = test.res;

  return (
    <>
      <PageHeader title="Immich" desc={t('Usa álbumes de tu biblioteca de Immich como fotos de fondo. Las fotos pasan por este servidor: la clave nunca llega a las pantallas.')} />
      <Card id="immich-conn" scope="global" title={t('Conexión')} icon="link">
        <ToggleRow label={t('Activar Immich')} checked={im.enabled} onChange={(v) => set((d) => void (d.immich = { ...(d.immich ?? DEFAULT_IMMICH), enabled: v }))} />
        <div class={`stack ${im.enabled ? '' : 'is-disabled'}`}>
          <Field label={t('URL del servidor Immich')} error={errors['immich.url']} hint={t('Dirección local, p. ej. http://immich.local:2283')}>
            <TextInput
              mono
              value={im.url}
              error={!!errors['immich.url']}
              placeholder="http://immich.local:2283"
              onValue={(v) => set((d) => void (d.immich = { ...(d.immich ?? DEFAULT_IMMICH), url: v }))}
              prefix={<Icon name="link" size={14} />}
            />
          </Field>
          <ToggleRow
            label={t('Certificado autofirmado')}
            hint={t('Acepta certificados HTTPS autofirmados (solo en tu red local)')}
            checked={im.insecureTls}
            onChange={(v) => set((d) => void (d.immich = { ...(d.immich ?? DEFAULT_IMMICH), insecureTls: v }))}
          />
          <Field
            label={t('Clave de API')}
            hint={`${t('Crea una clave en Immich (Ajustes de cuenta > Claves de API) con los permisos album.read, asset.read y asset.view')}. ${t('Se guarda solo en el servidor y nunca se vuelve a mostrar.')}`}
          >
            {keyStatus?.set && !editKey ? (
              <div class="search-row">
                <span class="wx-key-saved">
                  <Icon name="check" size={14} /> {t('Clave guardada')} <span class="mono muted">…{keyStatus.hint}</span>
                </span>
                <Button onClick={() => setEditKey(true)}>{t('Cambiar')}</Button>
                <Button variant="danger" loading={savingKey} onClick={() => saveKey('')}>
                  {t('Quitar')}
                </Button>
              </div>
            ) : (
              <form
                class="search-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (key.trim()) saveKey(key.trim());
                }}
              >
                <TextInput type="password" mono autocomplete="off" value={key} onValue={setKey} placeholder={t('Pega aquí tu clave')} prefix={<Icon name="key" size={14} />} />
                <Button type="submit" variant="primary" disabled={!key.trim()} loading={savingKey}>
                  {t('Guardar clave')}
                </Button>
              </form>
            )}
          </Field>
          <div class="row-actions">
            <Button icon="play" loading={test.loading} onClick={runTest} disabled={!im.url.trim()}>
              {t('Probar conexión')}
            </Button>
            {res &&
              (res.ok ? (
                <span class="ok-text">
                  <Icon name="check" size={15} /> {t('Conectado a Immich {v}', { v: res.version ?? '' })}
                </span>
              ) : (
                <span class="err-text">
                  <Icon name="alert" size={15} /> {immichErrorText(res.error)}
                </span>
              ))}
          </div>
          {res?.ok && !!res.missingScopes?.length && <Callout kind="warn">{t('A la clave le faltan permisos: {scopes}', { scopes: res.missingScopes.join(', ') })}</Callout>}
          <Callout>{t('Recuerda guardar la configuración (barra inferior) tras cambiar la URL o activar la integración.')}</Callout>
        </div>
      </Card>
      <Card
        id="immich-albums"
        scope="global"
        title={t('Álbumes')}
        icon="photos"
        muted={!status?.usable}
        desc={t('Elige qué álbumes muestra cada pantalla en Fondo > Fotos de fondo.')}
        actions={
          <Button size="sm" variant="ghost" icon="refresh" disabled={!status?.usable} loading={busy === 'refresh'} onClick={refresh}>
            {t('Actualizar ahora')}
          </Button>
        }
      >
        {!status?.usable ? (
          <Callout>{t('Immich no está configurado')}</Callout>
        ) : albumsError ? (
          <Callout kind="error">{immichErrorText(albumsError)}</Callout>
        ) : albums === null ? (
          <p class="muted small">{t('Cargando…')}</p>
        ) : albums.length === 0 ? (
          <Empty icon="photos" title={t('No hay álbumes')} />
        ) : (
          <ul class="immich-albums">
            {albums.map((a) => {
              const use = inUse.get(a.id);
              return (
                <li class="immich-album">
                  <AlbumCover album={a} />
                  <div class="immich-album__text">
                    <strong>{a.name || a.id}</strong>
                    <small class="muted">{t('{n} fotos', { n: a.count })}</small>
                  </div>
                  {use && (use.error && !use.missing ? <span class="badge badge--soft">{immichErrorText(use.error)}</span> : <span class="badge badge--soft">{t('En uso')}</span>)}
                </li>
              );
            })}
          </ul>
        )}
        {(status?.albums ?? [])
          .filter((a) => a.missing)
          .map((a) => (
            <Callout kind="warn">
              {t('Álbum no encontrado')}: <span class="mono">{a.id}</span>
            </Callout>
          ))}
      </Card>
      <Card id="immich-cache" scope="global" title={t('Caché de imágenes')} icon="archive" desc={t('Las fotos se guardan en este servidor para no pedirlas otra vez a Immich.')}>
        <div class="row-actions">
          <span class="muted">{status ? `${formatBytes(status.cache.bytes)} · ${t('{n} fotos', { n: status.cache.files })}` : '–'}</span>
          <Button icon="trash" variant="danger" loading={busy === 'cache'} disabled={!status?.cache.files} onClick={clearCache}>
            {t('Vaciar caché de Immich')}
          </Button>
        </div>
      </Card>
    </>
  );
}
