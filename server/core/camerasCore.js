// Cámaras Frigate (fork fsrhome): reglas puras de actividad y alertas, compartidas por el servidor y las pruebas.
// Mismas reglas que echo-reloj (html/js/frigate.js). Ver homelab-docs/specs/2026-10-13-marco-camaras-design.md.
export const CAMERA_ID_RE = /^[a-z0-9_]{1,40}$/;
export const ZONE_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const EVENT_ID_RE = /^[0-9.]+-[a-z0-9]+$/;
export const MAX_CAMERAS = 8;
export const MAX_ZONES = 20;
