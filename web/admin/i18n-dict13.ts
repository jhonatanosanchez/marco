// Backups, export and import on a server that leaves some settings out (Marco Cloud), and the gallery as a .zip.
// Spanish key; [es, en, pt].
export const ROWS13: [string, string, string][] = [
  [
    'La copia trae secretos (contraseña, tokens, enlaces privados, dispositivos vinculados). Aquí no se importan: los enlaces y dispositivos de tus pantallas siguen como están.',
    'The file has secrets (password, tokens, private links, paired devices). They are not imported here: your screens keep their links and devices.',
    'O ficheiro traz segredos (palavra-passe, tokens, links privados, dispositivos emparelhados). Aqui não são importados: os links e dispositivos dos teus ecrãs ficam como estão.',
  ],
  [
    'Home Assistant no se importa: Marco Cloud no puede conectarse a tu red de casa. El tiempo se toma de Open-Meteo.',
    'Home Assistant is not imported: Marco Cloud cannot reach your home network. The weather comes from Open-Meteo.',
    'O Home Assistant não é importado: o Marco Cloud não consegue ligar-se à tua rede de casa. O tempo vem do Open-Meteo.',
  ],
  [
    'La contraseña del panel y el inicio de sesión con Google no se importan: aquí entras con tu cuenta de Marco.',
    'The admin password and Google sign-in are not imported: here you sign in with your Marco account.',
    'A palavra-passe do painel e o início de sessão com Google não são importados: aqui entras com a tua conta Marco.',
  ],
  [
    'El acceso abierto a las pantallas no se importa: aquí cada pantalla usa su enlace privado o un dispositivo vinculado.',
    'Open display access is not imported: here each screen uses its private link or a paired device.',
    'O acesso aberto aos ecrãs não é importado: aqui cada ecrã usa o seu link privado ou um dispositivo emparelhado.',
  ],
  ['Se importan con la comprobación de certificados activada: {list}.', 'Imported with certificate checks on: {list}.', 'São importados com a verificação de certificados ativada: {list}.'],
  [
    'Calendarios de Google de cuentas que no están conectadas aquí, no se importan: {list}. Conecta la cuenta en Calendarios y vuelve a añadirlos.',
    'Google calendars of accounts not connected here are not imported: {list}. Connect the account in Calendars and add them again.',
    'Calendários Google de contas que não estão ligadas aqui não são importados: {list}. Liga a conta em Calendários e volta a adicioná-los.',
  ],
  [
    'No se importan porque su dirección no es accesible desde Internet (red local o nombre interno): {list}.',
    'Not imported because their address cannot be reached from the internet (local network or internal name): {list}.',
    'Não são importados porque o endereço não é acessível pela Internet (rede local ou nome interno): {list}.',
  ],
  ['Se actualizarán cada 30 minutos, el mínimo aquí: {list}.', 'They will refresh every 30 minutes, the minimum here: {list}.', 'Vão atualizar a cada 30 minutos, o mínimo aqui: {list}.'],
  ['Las fuentes de noticias no se importan: este servidor no ofrece noticias.', 'News feeds are not imported: this server does not offer news.', 'As fontes de notícias não são importadas: este servidor não oferece notícias.'],
  ['Las fotos de la galería no van en la copia: súbelas en Fotos.', 'Gallery photos are not in the file: upload them in Photos.', 'As fotos da galeria não vão no ficheiro: envia-as em Fotos.'],
  ['Lo que no se importa aquí', 'What is not imported here', 'O que não é importado aqui'],
  ['Supera el límite de tu plan ({max}): no se puede importar', 'Over your plan limit ({max}): cannot be imported', 'Ultrapassa o limite do teu plano ({max}): não pode ser importado'],
  [
    'Sirve también para pasar a un Marco instalado en casa: impórtalo en su panel. No lleva enlaces privados, dispositivos vinculados, tokens de API ni cuentas de Google, así que después vincula de nuevo las pantallas y vuelve a conectar Google Calendar.',
    'It also moves you to a Marco installed at home: import it in its admin. It has no private links, paired devices, API tokens or Google accounts, so afterwards pair the screens again and reconnect Google Calendar.',
    'Também serve para passar para um Marco instalado em casa: importa-o no painel dele. Não leva links privados, dispositivos emparelhados, tokens de API nem contas Google, por isso depois emparelha de novo os ecrãs e volta a ligar o Google Calendar.',
  ],
  ['Contiene las direcciones de tus calendarios: guárdalo en un lugar seguro.', 'It has the addresses of your calendars: keep it somewhere safe.', 'Contém os endereços dos teus calendários: guarda-o num lugar seguro.'],
  [
    'Las fotos de la galería no van en la copia de la configuración. Descárgalas todas en un .zip para guardarlas o subirlas en otra instalación.',
    'Gallery photos are not in the config file. Download them all in a .zip to keep them or upload them to another installation.',
    'As fotos da galeria não vão no ficheiro de configuração. Descarrega-as todas num .zip para as guardar ou enviar para outra instalação.',
  ],
  ['Descargar fotos (.zip)', 'Download photos (.zip)', 'Descarregar fotos (.zip)'],
  ['Descargando {done} de {total}…', 'Downloading {done} of {total}…', 'A descarregar {done} de {total}…'],
  ['La galería está vacía', 'The gallery is empty', 'A galeria está vazia'],
  ['La galería es demasiado grande para un solo .zip', 'The gallery is too large for one .zip', 'A galeria é demasiado grande para um único .zip'],
  ['Fotos descargadas', 'Photos downloaded', 'Fotos descarregadas'],
  ['Fotos descargadas · {n} no se pudieron leer', 'Photos downloaded · {n} could not be read', 'Fotos descarregadas · {n} não puderam ser lidas'],
  ['No se pudieron descargar las fotos', 'Could not download the photos', 'Não foi possível descarregar as fotos'],
];
