// Modo Echo Show (fork fsrhome): textos del admin (tarjeta de la pantalla y fila de Pantallas conectadas).
// Clave en español; [es, en, pt] para i18n-dict.ts y un mapa por idioma para nl y da.
export const ROWS_ECHO: [string, string, string][] = [
  ['Echo Show', 'Echo Show', 'Echo Show'],
  ['Para pantallas Echo Show en Silk: mantiene la página abierta, pide pantalla completa al tocar y cierra fuera de horario.', 'For Echo Show screens in Silk: keeps the page open, asks for full screen on tap and closes outside opening hours.', 'Para ecrãs Echo Show no Silk: mantém a página aberta, pede ecrã inteiro ao tocar e fecha fora do horário.'],
  ['Activar modo Echo Show', 'Turn on Echo Show mode', 'Ativar modo Echo Show'],
  ['Mantener viva', 'Keep alive', 'Manter viva'],
  ['Audio mudo (mp3)', 'Silent audio (mp3)', 'Áudio mudo (mp3)'],
  ['Apagado', 'Off', 'Desligado'],
  ['Abre a las', 'Opens at', 'Abre às'],
  ['Cierra a las', 'Closes at', 'Fecha às'],
  ['Pantalla completa al tocar', 'Full screen on tap', 'Ecrã inteiro ao tocar'],
  ['Pasar a modo ligero si va lenta', 'Switch to lite mode if it runs slow', 'Passar ao modo leve se ficar lenta'],
  ['Audio activo', 'Audio on', 'Áudio ativo'],
  ['Audio detenido', 'Audio stopped', 'Áudio parado'],
  ['Cerrado por horario', 'Closed (opening hours)', 'Fechado pelo horário'],
  ['Modo ligero por fps', 'Lite mode (low fps)', 'Modo leve por fps'],
];

export const NL_ECHO: Record<string, string> = {
  'Echo Show': 'Echo Show',
  'Para pantallas Echo Show en Silk: mantiene la página abierta, pide pantalla completa al tocar y cierra fuera de horario.': 'Voor Echo Show-schermen in Silk: houdt de pagina open, vraagt volledig scherm bij aanraken en sluit buiten de openingstijden.',
  'Activar modo Echo Show': 'Echo Show-modus inschakelen',
  'Mantener viva': 'Actief houden',
  'Audio mudo (mp3)': 'Stille audio (mp3)',
  'Apagado': 'Uit',
  'Abre a las': 'Opent om',
  'Cierra a las': 'Sluit om',
  'Pantalla completa al tocar': 'Volledig scherm bij aanraken',
  'Pasar a modo ligero si va lenta': 'Naar lichte modus als het traag is',
  'Audio activo': 'Audio aan',
  'Audio detenido': 'Audio gestopt',
  'Cerrado por horario': 'Gesloten (openingstijden)',
  'Modo ligero por fps': 'Lichte modus (lage fps)',
};

export const DA_ECHO: Record<string, string> = {
  'Echo Show': 'Echo Show',
  'Para pantallas Echo Show en Silk: mantiene la página abierta, pide pantalla completa al tocar y cierra fuera de horario.': 'Til Echo Show-skærme i Silk: holder siden åben, beder om fuld skærm ved tryk og lukker uden for åbningstiden.',
  'Activar modo Echo Show': 'Slå Echo Show-tilstand til',
  'Mantener viva': 'Hold i live',
  'Audio mudo (mp3)': 'Lydløs lyd (mp3)',
  'Apagado': 'Fra',
  'Abre a las': 'Åbner kl.',
  'Cierra a las': 'Lukker kl.',
  'Pantalla completa al tocar': 'Fuld skærm ved tryk',
  'Pasar a modo ligero si va lenta': 'Skift til let tilstand, hvis den er langsom',
  'Audio activo': 'Lyd til',
  'Audio detenido': 'Lyd stoppet',
  'Cerrado por horario': 'Lukket (åbningstid)',
  'Modo ligero por fps': 'Let tilstand (lav fps)',
};
