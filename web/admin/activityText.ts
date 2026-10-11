// Localized one-line description of an activity log entry (the server stores only type + data).
import type { ActivityEntry } from '../shared/types';
import type { IconName } from './components/icons';
import { nScreens, t } from './i18n';
import { fetchErrorText } from './apiErrors';

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const q = (v: unknown) => (str(v) ? `«${str(v)}»` : '');

export const ACTIVITY_GROUPS: { value: string; label: string; icon: IconName }[] = [
  { value: '', label: 'Todo', icon: 'list' },
  { value: 'auth', label: 'Accesos', icon: 'user' },
  { value: 'config', label: 'Configuración', icon: 'settings' },
  { value: 'backup', label: 'Copias', icon: 'archive' },
  { value: 'source', label: 'Calendarios', icon: 'calendar' },
  { value: 'announce', label: 'Avisos', icon: 'megaphone' },
  { value: 'token', label: 'API', icon: 'key' },
  { value: 'display', label: 'Pantallas', icon: 'monitor' },
  { value: 'privacy', label: 'Modo privado', icon: 'lock' },
  { value: 'google', label: 'Google', icon: 'google' },
];

/** Human name of a config section key as logged in config.saved (`calendar`, `screens:cocina.layout`…). */
export function sectionLabel(key: string): string {
  const m = /^screens:([^.]+)\.?(.*)$/.exec(key);
  const names: Record<string, string> = {
    calendar: 'Calendarios', datetime: 'Fecha y hora', weather: 'Tiempo', news: 'Noticias', todo: 'Tareas', localEvents: 'Eventos locales',
    birthdays: 'Cumpleaños', eventRules: 'Filtros', countdowns: 'Cuentas atrás', schedules: 'Mensajes programados', homeassistant: 'Home Assistant',
    auth: 'Seguridad', screens: 'Pantallas', defaultScreen: 'Pantalla predeterminada', screen: 'Ajustes', layout: 'Diseño', background: 'Fondo',
    message: 'Mensaje', alerts: 'Avisos', security: 'Acceso a las pantallas', privacy: 'Modo privado',
  };
  if (m) return `${m[1]}${m[2] ? ` › ${t(names[m[2]] ?? m[2])}` : ''}`;
  return t(names[key] ?? key);
}

export function describeActivity(e: ActivityEntry): { icon: IconName; text: string } {
  const d = (e.data ?? {}) as Record<string, any>;
  switch (e.type) {
    case 'auth.login':
      return { icon: 'user', text: d.method === 'google' ? t('Inicio de sesión con Google') : t('Inicio de sesión con contraseña') };
    case 'auth.login_failed':
      return { icon: 'alert', text: d.reason ? t('Intento de acceso fallido ({reason})', { reason: str(d.reason) }) : t('Intento de acceso fallido') };
    case 'auth.logout':
      return { icon: 'logout', text: t('Cierre de sesión') };
    case 'auth.logout_all':
      return { icon: 'logout', text: t('Cierre de sesión en todos los dispositivos') };
    case 'auth.setup_completed':
      return { icon: 'sparkles', text: t('Configuración inicial completada') + (d.screen ? ` · ${str(d.screen)}` : '') };
    case 'auth.setup_rejected':
      return { icon: 'alert', text: t('Asistente de configuración rechazado ({reason})', { reason: str(d.reason) }) };
    case 'auth.password_changed':
      return { icon: 'key', text: t('Contraseña cambiada') };
    case 'google.connected':
      return { icon: 'google', text: t('Cuenta de Google vinculada: {email}', { email: str(d.email ?? d.account) }) };
    case 'google.removed':
      return { icon: 'google', text: t('Cuenta de Google desvinculada: {email}', { email: str(d.email ?? d.account) }) };
    case 'microsoft.connected':
      return { icon: 'microsoft', text: t('Cuenta de Microsoft vinculada: {email}', { email: str(d.email ?? d.account) }) };
    case 'microsoft.removed':
      return { icon: 'microsoft', text: t('Cuenta de Microsoft desvinculada: {email}', { email: str(d.email ?? d.account) }) };
    case 'config.saved': {
      const secs: string[] = Array.isArray(d.sections) ? d.sections : [];
      const list = secs.slice(0, 4).map(sectionLabel).join(', ') + (secs.length > 4 ? ` +${secs.length - 4}` : '');
      return { icon: 'check', text: secs.length ? t('Configuración guardada: {list}', { list }) : t('Configuración guardada') };
    }
    case 'config.restored':
      return {
        icon: 'history',
        text: t('Copia restaurada {id}', { id: q(d.id ?? d.backup) }) + (Array.isArray(d.repaired) && d.repaired.length ? ` · ${t('valores corregidos: {list}', { list: d.repaired.slice(0, 5).join(', ') })}` : ''),
      };
    case 'config.imported':
      return { icon: 'upload', text: Array.isArray(d.sections) && d.sections.length ? t('Configuración importada: {list}', { list: d.sections.map(sectionLabel).join(', ') }) : t('Configuración importada') };
    case 'config.exported':
      return { icon: 'download', text: d.secrets ? t('Configuración exportada (con secretos)') : t('Configuración exportada') };
    case 'config.migrated':
      return d.from
        ? { icon: 'wand', text: t('Configuración migrada al formato multipantalla') }
        : { icon: 'wand', text: t('Instalación existente: pantallas en modo abierto (sin clave). Recomendado: enlaces privados.') };
    case 'backup.created':
      return { icon: 'archive', text: t('Copia de seguridad creada') };
    case 'backup.deleted':
      return { icon: 'trash', text: t('Copia de seguridad eliminada') };
    case 'source.error':
      return { icon: 'alert', text: t('Error en el calendario {name}: {error}', { name: q(d.name ?? d.sourceId), error: fetchErrorText(str(d.error)) }) };
    case 'source.recovered':
      return { icon: 'check', text: t('Calendario {name} recuperado', { name: q(d.name ?? d.sourceId) }) };
    case 'announce.sent':
      return { icon: 'megaphone', text: t('Aviso enviado: {title}', { title: q(d.title) || '–' }) + (d.via === 'hook' ? ` · ${t('vía webhook')}` : '') };
    case 'announce.cleared':
      return { icon: 'x', text: d.id ? t('Aviso retirado') : t('Avisos retirados') };
    case 'token.created':
      return { icon: 'key', text: t('Token de API creado: {name}', { name: q(d.name) }) };
    case 'token.revoked':
      return { icon: 'trash', text: t('Token de API revocado: {name}', { name: q(d.name) }) };
    case 'token.used':
      return { icon: 'zap', text: t('Webhook usado: {endpoint}', { endpoint: str(d.endpoint ?? d.path ?? '') }) };
    case 'token.rejected':
      return { icon: 'alert', text: t('Webhook rechazado (token no válido)') };
    case 'display.connected':
      return { icon: 'wifi', text: t('Pantalla conectada: {screen}', { screen: str(d.screenName ?? d.screen ?? d.slug ?? d.clientId ?? '') }) };
    case 'privacy.changed': {
      const where = Array.isArray(d.screens) && d.screens.length ? d.screens.map(str).join(', ') : t('todas las pantallas');
      const text = d.mode === 'off' ? t('Modo privado desactivado: {screens}', { screens: where })
        : d.mode === 'on' ? t('Modo privado activado: {screens}', { screens: where })
          : t('Modo privado cambiado: {screens}', { screens: where });
      return { icon: 'lock', text };
    }
    case 'display.command': {
      const a = str(d.action);
      const label = a === 'reload' ? t('recargar') : a === 'identify' ? t('identificar') : a === 'night' ? `${t('modo noche')} ${str(d.mode)}` : a;
      return { icon: 'monitor', text: t('Orden a pantallas: {action}', { action: label }) + (d.delivered != null ? ` · ${nScreens(Number(d.delivered))}` : '') };
    }
    case 'display.doorbell': {
      const text = d.action === 'dismiss' ? t('Timbre quitado de las pantallas') : d.extended ? t('Timbre: llamaron otra vez') : t('Timbre: llaman a la puerta');
      return { icon: 'bell', text: text + (d.via === 'hook' ? ` · ${t('vía webhook')}` : '') + (d.delivered != null ? ` · ${nScreens(Number(d.delivered))}` : '') };
    }
    case 'display.link_regenerated':
      return { icon: 'link', text: t('Enlace privado regenerado: {screen}', { screen: str(d.screen) }) + (Number(d.disconnected) ? ` · ${nScreens(Number(d.disconnected))}` : '') };
    case 'display.paired':
      return { icon: 'link', text: t('Pantalla vinculada: {name} → {screen}', { name: q(d.name), screen: str(d.screen) }) };
    case 'display.pair_failed':
      return { icon: 'alert', text: t('Código de vinculación incorrecto') };
    case 'display.device_updated':
      return { icon: 'edit', text: t('Dispositivo editado: {name}', { name: q(d.name) }) };
    case 'display.device_revoked':
      return { icon: 'trash', text: t('Dispositivo revocado: {name}', { name: q(d.name) }) };
    case 'update.requested':
      return { icon: 'download', text: d.by === 'auto' ? t('Actualización automática a {v} iniciada', { v: str(d.to) }) : t('Actualización a {v} iniciada', { v: str(d.to) }) };
    case 'update.finished':
      return d.state === 'current'
        ? { icon: 'check', text: t('Marco ya tenía la última versión ({v})', { v: str(d.to) }) }
        : { icon: 'sparkles', text: t('Marco actualizado: {from} → {to}', { from: str(d.from), to: str(d.to) }) };
    case 'update.failed':
      return {
        icon: 'alert',
        text: (d.target ? t('Falló la actualización a {v}', { v: str(d.target) }) : t('Falló la actualización')) + (d.rolledBack ? ` · ${t('Marco ha vuelto a la versión {v}', { v: str(d.from) })}` : ''),
      };
    case 'update.settings':
      return { icon: 'settings', text: d.auto ? t('Actualizaciones automáticas activadas ({from}–{to})', { from: str(d.from), to: str(d.to) }) : t('Ajustes de actualización guardados') };
    case 'activity.cleared':
      return { icon: 'trash', text: t('Registro de actividad vaciado') };
    default:
      return { icon: 'info', text: e.type };
  }
}

/** "token:Home Assistant" → "Home Assistant (API)", "system" → "Sistema" */
export function actorLabel(a: string): string {
  if (!a) return '–';
  if (a === 'system') return t('Sistema');
  if (a === 'anonymous') return t('Anónimo');
  if (a === 'password') return t('Contraseña');
  if (a.startsWith('token:')) return `${a.slice(6)} (API)`;
  return a;
}
