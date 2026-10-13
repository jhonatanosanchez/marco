// Cámaras Frigate (fork fsrhome): reglas puras de actividad y alertas, compartidas por el servidor y las pruebas.
// Mismas reglas que echo-reloj (html/js/frigate.js). Ver homelab-docs/specs/2026-10-13-marco-camaras-design.md.
export const CAMERA_ID_RE = /^[a-z0-9_]{1,40}$/;
export const ZONE_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const EVENT_ID_RE = /^[0-9.]+-[a-z0-9]+$/;
export const MAX_CAMERAS = 8;
export const MAX_ZONES = 20;

export const ACTIVITY_WINDOW_S = 30 * 60;
/** una pasada termina tras esto sin eventos de alerta del mismo grupo */
export const PASS_GAP_S = 5 * 60;
/** lo que empezó más de esto antes del arranque no se anuncia */
export const START_MARGIN_S = 60;
const ALERT_LABELS = new Set(['person']);
const SEEN_MAX = 500;

export const groupOf = (camera) => (camera.startsWith('ext_') ? 'exterior' : camera);

/** Eventos de Frigate utilizables: objeto, id con forma de Frigate, cámara conocida, start_time numérico. */
export function validEvents(events, cameraIds) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && EVENT_ID_RE.test(e.id)
    && typeof e.camera === 'string' && cameraIds.has(e.camera) && typeof e.label === 'string'
    && typeof e.start_time === 'number' && Number.isFinite(e.start_time));
}

/** Lo más reciente de cada cámara en los últimos 30 min (para la etiqueta sobre su recuadro). */
export function activityByCamera(events, nowS) {
  const out = {};
  for (const e of events) {
    if (nowS - e.start_time > ACTIVITY_WINDOW_S) continue;
    const cur = out[e.camera];
    if (!cur || e.start_time > cur.startTime) out[e.camera] = { label: e.label, startTime: e.start_time };
  }
  return out;
}

export const emptyAlertState = () => ({ seen: [], lastByGroup: {} });

/**
 * Alertas nuevas: una por pasada y por grupo. Devuelve un estado nuevo (no muta `state`).
 * `startedAtS`: arranque del servidor; lo de antes (más de START_MARGIN_S) cuenta para la pasada pero no se anuncia.
 */
export function newAlerts(state, events, startedAtS) {
  const seen = new Set(state.seen);
  const lastByGroup = { ...state.lastByGroup };
  const alerts = [];
  const sorted = events.slice().sort((a, b) => a.start_time - b.start_time);
  for (const e of sorted) {
    if (!ALERT_LABELS.has(e.label) || seen.has(e.id)) continue;
    seen.add(e.id);
    const g = groupOf(e.camera);
    const prev = lastByGroup[g];
    lastByGroup[g] = Math.max(prev || 0, e.start_time);
    const newPass = !prev || e.start_time - prev >= PASS_GAP_S;
    if (newPass && e.start_time >= startedAtS - START_MARGIN_S) {
      alerts.push({ camera: e.camera, label: e.label, startTime: e.start_time, eventId: e.id });
    }
  }
  return { state: { seen: [...seen].slice(-SEEN_MAX), lastByGroup }, alerts };
}

const cameraWidgetIds = (cfg) => new Set((cfg.widgets || []).filter((w) => w.type === 'cameras').map((w) => w.id));

/** Pantallas que necesitan el ciclo de eventos: con el widget colocado (o de layout 'widget') o con alertas. */
export function screensWantingCameras(cfg) {
  const ids = cameraWidgetIds(cfg);
  const out = new Set();
  for (const s of cfg.screens || []) {
    const placed = (s.widgets || []).some((p) => ids.has(p.widgetId)) || (s.layout?.preset === 'widget' && ids.has(s.layout.widgetId));
    if (placed || s.screen?.cameras?.personAlerts) out.add(s.id);
  }
  return out;
}

export const alertScreenIds = (cfg) => (cfg.screens || []).filter((s) => s.screen?.cameras?.personAlerts).map((s) => s.id);
