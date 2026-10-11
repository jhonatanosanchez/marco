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
  // servers that show the snapshot Home Assistant sends (Marco Cloud): the card in API & webhooks
  ['Timbre', 'Doorbell', 'Campainha'],
  [
    'Cuando llaman a la puerta, Home Assistant manda a Marco una foto de la cámara y las pantallas la muestran a pantalla completa durante unos segundos, con sonido de timbre. También despierta las pantallas en modo noche mientras dura.',
    'When someone rings, Home Assistant sends Marco a picture from the camera and the screens show it full screen for a few seconds, with a door chime. It also wakes screens in night mode while it lasts.',
    'Quando tocam à porta, o Home Assistant manda ao Marco uma foto da câmara e os ecrãs mostram-na em ecrã inteiro durante uns segundos, com som de campainha. Também acorda os ecrãs em modo noite enquanto dura.',
  ],
  ['Probar sin foto', 'Test without a picture', 'Testar sem foto'],
  ['Probar con una foto de ejemplo', 'Test with a sample picture', 'Testar com uma foto de exemplo'],
  [
    'Desde Home Assistant: POST /api/hooks/doorbell con un token de API y la foto de la cámara (JPEG, PNG o WebP, 2 MB como mucho). Marco guarda solo la última foto mientras suena el timbre, 10 minutos como mucho, y luego la borra. Solo la ven las pantallas que están sonando.',
    'From Home Assistant: POST /api/hooks/doorbell with an API token and the camera picture (JPEG, PNG or WebP, 2 MB at most). Marco keeps only the latest picture while the doorbell rings, 10 minutes at most, and then deletes it. Only the screens that are ringing see it.',
    'A partir do Home Assistant: POST /api/hooks/doorbell com um token de API e a foto da câmara (JPEG, PNG ou WebP, 2 MB no máximo). O Marco guarda só a última foto enquanto a campainha toca, 10 minutos no máximo, e depois apaga-a. Só a veem os ecrãs que estão a tocar.',
  ],
  ['Timbre con la foto de la cámara', 'Doorbell with the camera picture', 'Campainha com a foto da câmara'],
  ['Quitar el timbre de las pantallas', 'Take the doorbell off the screens', 'Tirar a campainha dos ecrãs'],
  ['Timbre en las pantallas de Marco', 'Doorbell on the Marco screens', 'Campainha nos ecrãs do Marco'],
  [
    'la foto como campo image (multipart) o como cuerpo image/jpeg con los campos en la URL',
    'the picture as an image field (multipart) or as an image/jpeg body with the fields in the URL',
    'a foto como campo image (multipart) ou como corpo image/jpeg com os campos no URL',
  ],
];
