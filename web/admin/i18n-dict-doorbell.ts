// Doorbell camera: the card in Home Assistant and its activity entries. Spanish key; [es, en, pt].
export const ROWS_DOORBELL: [string, string, string][] = [
  ['Timbre y cámara', 'Doorbell and camera', 'Campainha e câmara'],
  [
    'Cuando llaman a la puerta, Home Assistant avisa a Marco y las pantallas muestran la cámara a pantalla completa durante unos segundos, con sonido de timbre. También despierta las pantallas en modo noche mientras dura.',
    'When someone rings, Home Assistant tells Marco and the screens show the camera full screen for a few seconds, with a door chime. It also wakes screens in night mode while it lasts.',
    'Quando tocam à porta, o Home Assistant avisa o Marco e os ecrãs mostram a câmara em ecrã inteiro durante uns segundos, com som de campainha. Também acorda os ecrãs em modo noite enquanto dura.',
  ],
  ['Cámara (camera.*)', 'Camera (camera.*)', 'Câmara (camera.*)'],
  ['Sin cámara, las pantallas muestran solo el aviso.', 'Without a camera, the screens only show the notice.', 'Sem câmara, os ecrãs mostram só o aviso.'],
  ['Tiempo en pantalla', 'Time on screen', 'Tempo no ecrã'],
  [
    'Entre 10 y 300 segundos. Si vuelven a llamar, se alarga.',
    'Between 10 and 300 seconds. Ringing again makes it longer.',
    'Entre 10 e 300 segundos. Se voltarem a tocar, prolonga-se.',
  ],
  ['Sonido de timbre', 'Door chime', 'Som de campainha'],
  ['Quitar de las pantallas', 'Remove from the screens', 'Tirar dos ecrãs'],
  ['Timbre quitado de las pantallas', 'Doorbell removed from the screens', 'Campainha retirada dos ecrãs'],
  ['Timbre enviado a {n} pantallas', 'Doorbell sent to {n} screens', 'Campainha enviada para {n} ecrãs'],
  ['Timbre enviado, pero no hay ninguna pantalla conectada', 'Doorbell sent, but no screen is connected', 'Campainha enviada, mas nenhum ecrã está ligado'],
  [
    'Desde Home Assistant: POST /api/hooks/doorbell con un token de API («API y webhooks»). El ejemplo completo está en docs/API.md. La imagen pasa por este servidor: el token de Home Assistant nunca llega a las pantallas y no se guarda ninguna imagen.',
    'From Home Assistant: POST /api/hooks/doorbell with an API token ("API & webhooks"). The full example is in docs/API.md. The picture goes through this server: the Home Assistant token never reaches the screens and no picture is stored.',
    'A partir do Home Assistant: POST /api/hooks/doorbell com um token de API («API e webhooks»). O exemplo completo está em docs/API.md. A imagem passa por este servidor: o token do Home Assistant nunca chega aos ecrãs e nenhuma imagem é guardada.',
  ],
  ['Timbre: llaman a la puerta', 'Doorbell: someone is at the door', 'Campainha: está alguém à porta'],
  ['Timbre: llamaron otra vez', 'Doorbell: rang again', 'Campainha: tocaram outra vez'],
];
