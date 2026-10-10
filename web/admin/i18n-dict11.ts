// Config save conflicts (409) and the error codes a server can answer with (apiErrors.ts). Spanish key; [es, en, pt].
export const ROWS11: [string, string, string][] = [
  ['Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.', 'Too many requests in a row. Wait a moment and try again.', 'Demasiados pedidos seguidos. Espera um momento e tenta de novo.'],
  ['Has llegado al máximo de pantallas.', 'You have reached the maximum number of screens.', 'Chegaste ao máximo de ecrãs.'],
  ['Esta función no está disponible en este servidor.', 'This feature is not available on this server.', 'Esta função não está disponível neste servidor.'],
  ['La configuración se ha guardado en otro sitio mientras editabas. Recarga la página para ver la versión actual.', 'The settings were saved somewhere else while you were editing. Reload the page to see the current version.', 'A configuração foi guardada noutro sítio enquanto editavas. Recarrega a página para veres a versão atual.'],
  ['No queda espacio para más fotos. Borra alguna y vuelve a intentarlo.', 'There is no room for more photos. Delete some and try again.', 'Não há espaço para mais fotos. Apaga algumas e tenta de novo.'],
  ['Tu cuenta solo puede ver la configuración, no cambiarla.', 'Your account can view the settings but not change them.', 'A tua conta pode ver a configuração, mas não alterá-la.'],
  ['La configuración ha cambiado mientras editabas', 'The settings changed while you were editing', 'A configuração mudou enquanto editavas'],
  ['Se ha guardado desde otra pestaña u otro dispositivo.', 'They were saved from another tab or device.', 'Foi guardada noutro separador ou noutro dispositivo.'],
  [
    'Puedes cargar la versión guardada (pierdes lo que has cambiado aquí) o guardar tus cambios encima. Lo que no hayas tocado se queda como está en la versión guardada.',
    'You can load the saved version (and lose what you changed here) or save your changes on top of it. Anything you did not touch stays as it is in the saved version.',
    'Podes carregar a versão guardada (e perder o que mudaste aqui) ou guardar as tuas alterações por cima. O que não tocaste fica como está na versão guardada.',
  ],
  ['Seguir editando', 'Keep editing', 'Continuar a editar'],
  ['Cargar la versión guardada', 'Load the saved version', 'Carregar a versão guardada'],
  ['Guardar mis cambios', 'Save my changes', 'Guardar as minhas alterações'],
  ['Se ha cargado la versión guardada', 'Loaded the saved version', 'Versão guardada carregada'],
  // Sent messages on a server whose screens poll (liveNote.ts)
  ['llegará a las pantallas en unos 90 s', 'reaches the screens within about 90 s', 'chega aos ecrãs em cerca de 90 s'],
];
