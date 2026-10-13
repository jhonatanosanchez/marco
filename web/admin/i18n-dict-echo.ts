// Modo Echo Show (fork fsrhome): textos del admin (tarjeta de la pantalla y fila de Pantallas conectadas).
// Clave en español; [es, en, pt] para i18n-dict.ts y un mapa por idioma para nl y da.
export const ROWS_ECHO: [string, string, string][] = [
  ['Audio activo', 'Audio on', 'Áudio ativo'],
  ['Audio detenido', 'Audio stopped', 'Áudio parado'],
  ['Cerrado por horario', 'Closed (opening hours)', 'Fechado pelo horário'],
  ['Modo ligero por fps', 'Lite mode (low fps)', 'Modo leve por fps'],
];

export const NL_ECHO: Record<string, string> = {
  'Audio activo': 'Audio aan',
  'Audio detenido': 'Audio gestopt',
  'Cerrado por horario': 'Gesloten (openingstijden)',
  'Modo ligero por fps': 'Lichte modus (lage fps)',
};

export const DA_ECHO: Record<string, string> = {
  'Audio activo': 'Lyd til',
  'Audio detenido': 'Lyd stoppet',
  'Cerrado por horario': 'Lukket (åbningstid)',
  'Modo ligero por fps': 'Let tilstand (lav fps)',
};
