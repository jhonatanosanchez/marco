<div align="center">

<img src="docs/logo.svg" width="96" height="96" alt="Logo de Marco: un marco de fotos redondeado con un pequeño calendario y un sol">

# Marco

### El día de tu familia, enmarcado.

Un *marco* de fotos que también enmarca el día de tu familia.

**Un calendario familiar de pared y panel de información precioso para una Raspberry Pi —o cualquier navegador— que alojas tú mismo.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](#docker)
[![Languages](https://img.shields.io/badge/i18n-English%20%C2%B7%20Espa%C3%B1ol%20%C2%B7%20Portugu%C3%AAs-orange)](#)

[English](README.md) · **Español**

![Marco en una pantalla de 1920×1080: reloj, destacados, cuentas atrás, tiempo y un calendario mensual con eventos, cumpleaños y estancias de alquiler vacacional](docs/screenshots/display-es.png)

</div>

## Por qué

Marco está inspirado en [DAKboard](https://dakboard.com/): una pantalla de pared que muestra de un vistazo el
calendario familiar, la hora, el tiempo, fotos y noticias. Es una **alternativa gratuita, de código abierto y
autoalojada** que ejecutas en tu propia Raspberry Pi, servidor doméstico o NAS **dentro de tu red local**. Sin cuenta,
sin suscripción y sin nube de por medio: tu configuración, tus fotos y los datos de tus calendarios se quedan en casa.
El único tráfico saliente va a los calendarios, al tiempo y a las fuentes de noticias que *tú* conectes.

> Marco es un proyecto independiente. No está afiliado, respaldado ni vinculado de ningún modo a DAKboard;
> DAKboard es una marca registrada de su propietario.

**Contenido:** [Funciones](#funciones) · [Cómo funciona](#cómo-funciona) · [Pruébalo](#pruébalo-en-un-minuto) ·
[Inicio rápido](#inicio-rápido) · [Kiosco con Raspberry Pi](#kiosco-con-raspberry-pi) · [Google Calendar](#conectar-google-calendar) ·
[Otras integraciones](#otras-integraciones) · [Fotos](#fotos) · [Pantallas, avisos y API](#varias-pantallas-avisos-y-la-api) ·
[Configuración](#referencia-de-configuración) · [Seguridad](#seguridad) · [Desarrollo](#desarrollo)

## Funciones

### La pantalla

| | |
|---|---|
| ![Calendario grande en una pantalla de Raspberry Pi de 1280×720](docs/screenshots/display-1280x720.png) | ![Diseño vertical de 1080×1920](docs/screenshots/display-portrait-1080x1920.png) |
| ![Diseño de agenda](docs/screenshots/display-agenda.png) | ![Diseño de reloj grande](docs/screenshots/display-bigtime.png) |
| ![Vista semanal](docs/screenshots/display-week.png) | ![Tema claro, calendario a la izquierda y foto a la derecha](docs/screenshots/display-light.png) |
| ![Aviso a pantalla completa enviado desde Home Assistant](docs/screenshots/display-announcement.png) | ![Reloj analógico, efecto de lluvia y un mensaje programado](docs/screenshots/display-rain.png) |

- **Calendario** — vistas de mes (con número de semanas configurable), agenda y semana; cinco diseños (*calendario
  grande*, *izquierda/derecha*, *arriba/abajo*, *hora grande*, *agenda*), en horizontal o vertical, y cada calendario
  con su propio color.
- **Emojis automáticos** — 🎂 cumpleaños, ✈️ vuelos, 🩺 médico, 🎒 colegio, ⚽ deporte, 🍽️ cenas, 💼 reuniones, 🏖️
  vacaciones, 🚗 coche, 🐾 veterinario… a partir de reglas de palabras clave editables (con palabras clave en inglés,
  español y portugués de serie).
- **Cumpleaños con edad** — "🎂 Abuela Isabel (72)", desde un calendario de cumpleaños o introducidos en la
  administración.
- **Fuentes de alquiler vacacional** (el "Reserved" de Airbnb, Booking o herramientas de gestión de alojamientos que
  publican títulos como `🏠 Guest - 4p+1m` y líneas de descripción `Adults/Children/Infants`): barras de entrada →
  salida a lo largo de los días, huéspedes como iconos 🧑🏻🧒🏻👶🏻🐶, 🚪 salidas, avisos destacados de "Entrada hoy" y
  fechas bloqueadas que puedes ocultar.
- **Destacados y cuentas atrás** — "En 18 min · Llamada con cliente", "Salida · Mañana", "🎃 Fiesta de Halloween ·
  ¡Mañana!", "✈️ Viaje a Madeira · En 12 días".
- **Tiempo** — condiciones actuales y previsión por horas y por días de [Open-Meteo](https://open-meteo.com/) (sin
  clave de API), o tu propia entidad de tiempo y sensores interiores de [Home Assistant](https://www.home-assistant.io/);
  lluvia/nieve animadas.
- **Teletipo de noticias** desde cualquier fuente RSS/Atom, una lista de tareas y un mensaje del día.
- **Fondo de fotos** — fotos de stock o tu propia galería, transiciones WebGL, zoom lento, un suave efecto ambiental de
  "aurora" y **recorte inteligente** que mantiene al protagonista (caras, mascotas…) en la parte de la pantalla que no
  tapan el reloj ni el tiempo.
- **Siempre legible** — el desenfoque/sombreado de los paneles se adapta a la foto; las pantallas pequeñas usan un
  texto relativamente más grande; el modo noche atenúa la pantalla según un horario.
- **Actualizaciones en directo invisibles** — los cambios guardados en la administración aparecen en un segundo
  mediante Server-Sent Events; los datos se actualizan in situ sin recargar nunca la página; si el servidor desaparece,
  sigue funcionando con los últimos datos.
- **Avisos** — tarjetas instantáneas a pantalla completa con un sonido ("🧺 La lavadora ha terminado") y **mensajes
  programados** ("🗑️ Sacar la basura", mar. y vie. 20:00–22:00).
- **Pensado para la Pi** — límite de 30 fps, se pausa cuando está oculta y `?lite=1` desactiva WebGL por completo.

### El panel de administración

| | |
|---|---|
| ![Panel de inicio de la administración](docs/screenshots/es-admin-home.png) | ![Calendarios con una cuenta de Google vinculada](docs/screenshots/es-admin-calendars-google.png) |
| ![Filtros y cambios](docs/screenshots/admin-filters.png) | ![Cumpleaños](docs/screenshots/admin-birthdays.png) |
| ![Galería de fotos: contador de rotación, filtros y ojo para ocultar cada foto](docs/screenshots/admin-photos.png) | ![Editor del punto focal](docs/screenshots/admin-photos-focus.png) |
| ![Pantallas conectadas](docs/screenshots/admin-displays.png) | ![Tokens de API y ejemplo para Home Assistant](docs/screenshots/admin-api.png) |

- **Panel de inicio** — pantallas conectadas, próximos eventos, estado de los calendarios, tiempo, avisos activos,
  actividad reciente y acciones rápidas (recargar, identificar, modo noche, enviar un aviso).
- **Calendarios** — URL iCal/ICS (incluidas `webcal://` y HTTPS con certificado autofirmado), **Google Calendar**
  mediante OAuth, festivos predefinidos, y por calendario: color, emoji, tipo (general / alquiler vacacional /
  cumpleaños / festivos) y frecuencia de actualización.
- **Eventos locales** (puntuales o que se repiten cada semana / mes / año, con excepciones) y **cumpleaños** (con
  importación desde CSV).
- **Filtros y cambios** — oculta ("Not available"), renombra o fuerza el emoji/color de una serie, con una vista previa
  en directo de los próximos 14 días. **Reglas de iconos** con un probador. **Cuentas atrás**.
- **Galería de fotos** — arrastrar y soltar, optimización en el navegador (rotación EXIF, redimensionado, miniaturas),
  conversión de **HEIC** del iPhone, punto focal automático con editor manual y gestión de nombres duplicados.
- **Varias pantallas** (salón, cocina, pasillo…), cada una con su propio diseño, fondo, calendarios y widgets, y una
  página de **Pantallas conectadas** (resolución, navegador, versión, recargar / identificar / modo noche por
  dispositivo).
- **Enlaces privados y vinculación de pantallas** — cada pantalla tiene un enlace imposible de adivinar (`/d/<clave>`,
  código QR, regenerar con un clic) y los dispositivos nuevos se vinculan con un código de 6 caracteres; los
  dispositivos vinculados se pueden renombrar o revocar.
- **Avisos** — envíalos al momento o prográmalos; **tokens de API y webhooks** para Home Assistant y scripts.
- **Copias de seguridad** (automáticas, exportar/importar con vista previa), **registro de actividad**, **paleta de
  comandos** (Ctrl/Cmd + K), diseño adaptado al móvil, en inglés / español / portugués.

| | | |
|---|---|---|
| ![Paleta de comandos](docs/screenshots/admin-home-palette.png) | ![Editor de eventos locales](docs/screenshots/admin-local-edit.png) | ![Diálogo de conflicto al subir](docs/screenshots/admin-photos-conflict.png) |
| ![Pantallas](docs/screenshots/admin-screens.png) | ![Avisos](docs/screenshots/admin-alerts.png) | ![Registro de actividad](docs/screenshots/admin-activity.png) |
| ![Copias de seguridad](docs/screenshots/admin-backups.png) | ![Cuentas atrás](docs/screenshots/admin-countdowns.png) | ![Reglas de iconos](docs/screenshots/admin-icons.png) |
| ![Página de inicio de sesión](docs/screenshots/admin-login.png) | ![Eventos locales](docs/screenshots/admin-local.png) | |

<p align="center">
  <img src="docs/screenshots/mobile-home.png" width="230" alt="Administración en un móvil: inicio">
  <img src="docs/screenshots/mobile-home-menu.png" width="230" alt="Administración en un móvil: menú">
  <img src="docs/screenshots/mobile-calendars.png" width="230" alt="Administración en un móvil: calendarios">
</p>

## Cómo funciona

```mermaid
flowchart LR
  subgraph home["Tu red doméstica"]
    server["Servidor de Marco<br/>Node.js · Pi / servidor doméstico / NAS / Docker<br/>data/ = configuración, fotos, copias"]
    tv["Pantalla de pared<br/>Raspberry Pi + Chromium en modo kiosco"]
    tablet["Tablet de la cocina / navegador de la TV<br/>/d/&lt;clave privada&gt;"]
    phone["Móvil u ordenador<br/>/admin/"]
    ha["Home Assistant<br/>(opcional)"]
  end
  google["Google Calendar API"]
  feeds["Fuentes iCal · Open-Meteo · RSS · picsum.photos"]

  server -- "HTTP + actualizaciones en directo (SSE)" --> tv
  server -- "HTTP + actualizaciones en directo (SSE)" --> tablet
  phone -- "configurar" --> server
  ha -- "webhooks: avisos, modo noche" --> server
  server -- "sensores, tiempo" --> ha
  server --> google
  server --> feeds
```

- Un pequeño **servidor Node.js** (sin base de datos ni módulos nativos) descarga y guarda en caché tus calendarios,
  el tiempo y las noticias, almacena tus ajustes y fotos en una carpeta `data/` y sirve dos aplicaciones web.
- Las **pantallas** son simplemente navegadores: una Raspberry Pi en modo kiosco, una tablet antigua, el navegador de
  una smart TV. Cada una abre el **enlace privado** de su pantalla (`/d/<clave>`) o se **vincula** con un código.
  Reciben los cambios al instante mediante Server-Sent Events.
- El **panel de administración** en `/admin/` funciona desde cualquier móvil u ordenador de tu red.

Más detalles: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y [docs/API.md](docs/API.md).

## Pruébalo en un minuto

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
npm ci
npm run demo
```

`npm run demo` compila la interfaz web si hace falta y arranca un servidor con un **directorio de datos desechable**
lleno de una familia ficticia: dos pantallas ("Living room" y "Kitchen"; "Salón" y "Cocina" con `--lang es`), eventos
locales, cumpleaños, cuentas atrás, filtros, una fuente de alquiler vacacional y un calendario escolar (servidos
localmente), fotos de ejemplo de picsum.photos con puntos focales, un token de API y algo de historial de actividad. Tu
carpeta `data/` real nunca se toca.

- Pantalla: la demo muestra el **enlace privado** de cada pantalla (`http://localhost:3000/d/<clave>`);
  <http://localhost:3000/pair> muestra un código para probar *Pantallas conectadas → Vincular una pantalla*
- Administración: <http://localhost:3000/admin/> — contraseña **`demo-calendar`**
- Opciones: `--port 3080`, `--lang es` (o `pt`), `--no-photos`, `--data ./demo-data --keep`

![La pantalla de la cocina de la demo: tema claro, agenda, lista de tareas y tiempo en directo](docs/screenshots/display-kitchen-live.png)

¿Solo quieres ver la pantalla? Cualquier instancia en marcha muestra un conjunto de datos de ejemplo integrado en
`/?demo=1` (añade `&lang=es`, `&preset=agenda`, `&theme=light`, `&announce=success`, `&sched=1`,
`&now=2026-10-09T10:42`…).

## Inicio rápido

Requisitos: **Node.js 20 o superior** (se recomienda 22 LTS) en Linux, macOS o Windows, o bien Docker.

### Con Node.js

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
npm ci
cp .env.example .env        # opcional: PORT, PUBLIC_URL, claves de Google, SETUP_TOKEN
npm run build
npm start                   # http://localhost:3000/  y  http://localhost:3000/admin/
```

En una Raspberry Pi o cualquier máquina basada en Debian, `deploy/install.sh` hace todo esto por ti e instala un
servicio de systemd; consulta [Kiosco con Raspberry Pi](#kiosco-con-raspberry-pi).

### Docker

```bash
git clone https://github.com/mr-reb00t/marco.git
cd marco
docker compose up -d        # construye la imagen y la arranca en el puerto 3000
docker compose logs marco | grep setup   # la URL de configuración de un solo uso
```

Después abre esa URL de configuración (cambia `localhost` por la dirección del servidor si estás en otro dispositivo)
y sigue el [asistente de configuración](#primeros-pasos-el-asistente-de-configuración). **No hay contraseña por
defecto**: la crea el asistente. En Docker el asistente pide **siempre** este código de un solo uso (la imagen define
`SETUP_REQUIRE_TOKEN=1`), porque dentro de un contenedor cualquier cliente puede parecer de la red local. Los datos se guardan en el volumen `marco-data` (`/data`
dentro del contenedor). La imagen se ejecuta con un usuario sin privilegios de root y tiene un health check en
`/api/health`. Sin Compose:
`docker build -t marco . && docker run -d -p 3000:3000 -v marco-data:/data marco`.

> **Instalaciones expuestas o remotas** (un VPS, una redirección de puertos, un proxy inverso): pon
> `SETUP_TOKEN=<valor aleatorio largo>` en el `.env` junto a `docker-compose.yml` (p. ej.
> `echo "SETUP_TOKEN=$(openssl rand -hex 16)" >> .env`) *antes* del primer arranque. Así el asistente no funciona sin
> él y nadie más puede quedarse con tu instalación nueva; abre `http://<dirección-del-servidor>:3000/admin/?setup=<token>`.
> Las instalaciones sin navegador pueden definir `ADMIN_PASSWORD` en su lugar (se omite el asistente y el panel propone
> cambiarla después).
>
> **Docker detrás de un proxy inverso** (Caddy, nginx, cloudflared, en el mismo host o no): el proxy llega al
> contenedor a través del bridge de Docker, así que define `TRUST_PROXY=172.16.0.0/12` (o la dirección del proxy) en
> ese `.env`. Si no, el servidor no ve la dirección real del cliente: los visitantes que pasan por el proxy se tratan
> como remotos y la cookie de sesión no se marca `Secure`. **Compose solo pasa al contenedor las variables que
> aparecen en `docker-compose.yml`** (`SETUP_TOKEN`, `SETUP_REQUIRE_TOKEN`, `ADMIN_PASSWORD`, `PUBLIC_URL`,
> `ALLOWED_HOSTS`, `TRUST_PROXY`, `COOKIE_SECURE`, `SESSION_SECRET`, `LAN_ADDRESS`, las claves de Google); añade
> ahí las demás.

### Primeros pasos: el asistente de configuración

Una instalación nueva no tiene contraseña de administración ni ajustes propios. La primera vez que abres
`http://<server-ip>:3000/admin/`, un **asistente de configuración** te guía en unos dos minutos, y la pantalla
(`http://<server-ip>:3000/`) muestra una bienvenida con la dirección del panel y un código QR hasta que terminas.

| | |
|---|---|
| ![Asistente, paso 1: bienvenida e idioma](docs/screenshots/setup-1-welcome.png) | ![Paso 2: contraseña con medidor de seguridad](docs/screenshots/setup-2-password.png) |
| ![Paso 3: búsqueda de ciudad, zona horaria, unidades y formato de hora](docs/screenshots/setup-3-location.png) | ![Paso 4: festivos por país, fuentes iCal con botón Probar, notas sobre Google](docs/screenshots/setup-4-calendars.png) |
| ![Paso 5: nombre de la pantalla, diseño, color, fotos y efecto ambiental](docs/screenshots/setup-5-look.png) | ![Paso 6: el enlace privado de la pantalla con botón de copiar y código QR, resumen y consejos](docs/screenshots/setup-6-done.png) |

1. **Bienvenida**: elige el idioma (English, Español, Português).
2. **Contraseña del panel**: al menos 10 caracteres, nada obvio (`password123`, `1234567890`, `qwertyuiop`…),
   escrita dos veces; un medidor te ayuda. La pantalla en sí nunca necesita contraseña.
3. **Ubicación**: busca tu ciudad (Open-Meteo, sin clave de API); la zona horaria viene con ella (o del navegador);
   después elige °C/°F y reloj de 24 h o 12 h. ¿El navegador no tiene Internet? Escribe las coordenadas u omite la
   ubicación y añádela más tarde (el tiempo la necesita; la zona horaria se guarda igualmente).
4. **Calendarios**: marca los festivos de tu país (preseleccionados según la ciudad), pega direcciones iCal (`.ics`)
   y pulsa **Probar** para comprobarlas. Google Calendar: pega la *dirección secreta en formato iCal* del calendario,
   o vincula la cuenta después si el servidor tiene [un cliente OAuth de Google](#conectar-google-calendar).
5. **Aspecto**: nombre de la pantalla, diseño, color de acento, tema claro u oscuro, fotos de fondo (stock ahora, tu
   galería más tarde) y efecto ambiental.
6. **Listo**: el **enlace privado** de la pantalla para abrir en la tele o la Raspberry Pi (botón de copiar + código
   QR; si hiciste la configuración en el propio servidor como `localhost`, usa su dirección de la red local), un
   resumen y consejos (`?lite=1` para dispositivos lentos, el comando del instalador solo kiosco con el enlace
   privado). Ya tienes la sesión iniciada y entras al panel. Una pantalla que mostraba la bienvenida pasa a mostrar un
   [código de vinculación](#enlaces-privados-y-vinculación-de-pantallas).

<img src="docs/screenshots/setup-mobile.png" alt="El asistente de configuración en un móvil" width="260" align="right">

El asistente también funciona en el móvil, y todo lo que configura se puede cambiar después en el panel.

**Quién puede usarlo.** Los endpoints de configuración solo funcionan mientras no exista una contraseña (después
responden `409`), solo un navegador puede completarlos y además:

- desde tu **red local** el asistente funciona sin más: la dirección del cliente es loopback o privada, la petición no
  llega a través de un proxy inverso que falte en `TRUST_PROXY` y (en un contenedor) no es la pasarela del contenedor;
- desde **cualquier otro sitio** necesita la URL de un solo uso que el servidor escribe al arrancar:
  `[setup] Open http://localhost:3000/admin/?setup=<token> to finish setup` (`journalctl -u marco | grep setup`,
  `docker compose logs marco | grep setup` o la terminal donde corre `npm start`). El registro muestra
  `localhost` con el puerto real y las direcciones de la red local que detecta; desde otro dispositivo usa la
  dirección del servidor en lugar de `localhost` (y, en Docker, el puerto publicado);
- con **`SETUP_TOKEN`** definido, el token se exige desde cualquier sitio: recomendado para VPS, proxies inversos y todo
  lo que sea accesible desde Internet. `SETUP_REQUIRE_TOKEN=1` (por defecto en la imagen Docker) hace lo mismo con el
  token generado del registro. Una instalación que ya estaba configurada pero perdió `data/secrets.json` también lo pide.

El servidor solo responde a nombres de host conocidos (protección contra DNS rebinding, en el que una web maliciosa
apunta su propio nombre a tu servidor): direcciones IP, `localhost`, nombres de una sola etiqueta (`raspberrypi`),
`*.local`, `*.lan`, `*.home.arpa`, `*.internal`, el host de `PUBLIC_URL` y lo que pongas en `ALLOWED_HOSTS`. El resto
recibe `421`.

Actualizar una instalación existente nunca muestra el asistente: si ya hay una contraseña guardada, no cambia nada.
Con `ADMIN_PASSWORD` definido y sin contraseña guardada, se usa esa contraseña (instalaciones sin navegador) y el panel
sugiere cambiarla.

![La bienvenida de la pantalla en una instalación nueva: dirección del panel y código QR](docs/screenshots/display-welcome.png)

<br clear="right">

## Enlaces privados y vinculación de pantallas

Desde la 0.3 todas las pantallas son **privadas** por defecto: un navegador solo muestra el calendario si ha abierto el
**enlace privado** de la pantalla o se ha **vinculado** desde el panel. Si no, muestra un código de vinculación y nada
más. Así Marco es seguro en redes compartidas (wifi de un piso compartido, oficina) y puedes acceder desde Internet
detrás de HTTPS.

| | |
|---|---|
| ![Pantalla → Ajustes → Enlace privado: enlace, código QR, regenerar y el comando para la Raspberry Pi](docs/screenshots/admin-private-link.png) | ![Vincular una pantalla: código, pantalla y nombre del dispositivo](docs/screenshots/admin-pairing-dialog.png) |
| ![Una pantalla nueva sin clave muestra un código de vinculación y un código QR](docs/screenshots/display-pairing.png) | ![Enlace regenerado o dispositivo revocado: «Este enlace ya no es válido»](docs/screenshots/display-invalid-link.png) |

- **Enlace privado** — *Pantalla → Ajustes → Enlace privado* muestra el enlace de la pantalla seleccionada, p. ej.
  `http://homeserver.lan:3000/d/3f6c0a52-9d1e-4b7a-a2c4-0e5b8f1d2c37`, con **Copiar**, un **código QR**, **Abrir**,
  **Regenerar enlace** y el comando listo para pegar en la Raspberry Pi. Guárdalo como marcador en una tablet, úsalo
  como URL del kiosco o escanea el QR con el dispositivo. El enlace es la llave: quien lo tenga ve esa pantalla (y solo
  esa: `?screen=` se ignora), así que úsalo solo en tus dispositivos.
- **Vinculación** — sin teclear enlaces largos en una tele: abre la dirección normal (`http://homeserver.lan:3000/` o
  `/pair`) en el dispositivo nuevo y mostrará un **código de 6 caracteres** grande y un código QR. En el móvil abre
  *Pantallas conectadas → Vincular una pantalla* (o escanea el QR: abre el panel con el código ya escrito), escribe el
  código, elige la pantalla y un nombre. El dispositivo arranca en un par de segundos y guarda su propia llave en el
  almacenamiento del navegador: ideal para tablets, teles y navegadores que sigues usando. El kiosco de la Raspberry Pi
  abre Chromium en modo incógnito (nada sobrevive a un reinicio), así que a él dale el enlace privado.
- **Dispositivos vinculados** — *Pantallas conectadas* los lista con la pantalla que muestran y cuándo se vieron por
  última vez; **Editar** los renombra o los pasa a otra pantalla y **Revocar** les corta el acceso.
- **Regenerar / revocar** — *Regenerar enlace* cambia la clave al instante; las pantallas que usaban el enlace antiguo
  (o un dispositivo revocado) pasan a «Este enlace ya no es válido», borran sus datos en caché y ofrecen un código de
  vinculación nuevo.
- **Modo de acceso a las pantallas** (*Seguridad → Acceso a las pantallas*): **Privado** (por defecto en las
  instalaciones nuevas) o **Abierto (red local)**, el comportamiento de la 0.2, en el que `/` y `/?screen=<slug>`
  funcionan sin clave. **Al actualizar desde la 0.2 se mantiene Abierto** para que ningún kiosco se quede en blanco, y
  el panel recomienda cambiarlo: primero abre en cada pantalla su enlace privado (o vincúlala); al guardar Privado, las
  pantallas sin clave muestran un código de vinculación. La vista previa del panel y *Ver pantalla* siguen funcionando
  con tu sesión en ambos modos.

![Pantallas conectadas: cómo entró cada pantalla y los dispositivos vinculados](docs/screenshots/admin-displays-paired.png)

La clave es un **UUIDv4** aleatorio (122 bits aleatorios): fácil de leer y teclear en una Pi (hexadecimal en
minúsculas, sin letras ambiguas) e imposible de adivinar. Los cálculos de fuerza bruta, qué se registra (nada secreto)
y el modelo de amenazas completo están en [SECURITY.md](SECURITY.md#private-display-links-and-pairing-threat-model)
(en inglés).

## Kiosco con Raspberry Pi

Probado con Raspberry Pi OS **Bookworm** (64 bits, escritorio) en Pi 4/5; una Pi 3 funciona con `?lite=1`.
El instalador es idempotente: vuelve a ejecutarlo después de cada `git pull`.

### A. Servidor y pantalla en la misma Pi (todo en uno)

```bash
git clone https://github.com/mr-reb00t/marco.git ~/marco
cd ~/marco
./deploy/install.sh
sudo reboot
```

Instala Node.js 22 (si hace falta), Chromium y utilidades para el kiosco, ejecuta `npm ci` + `npm run build`, crea
`.env` con un `SESSION_SECRET` aleatorio, instala y arranca el servicio de systemd `marco`, añade el kiosco al inicio automático del escritorio (se
admiten labwc, Wayfire y LXDE), desactiva el apagado de pantalla y activa el inicio de sesión automático en el
escritorio. Tras reiniciar, la pantalla muestra la bienvenida con un código QR: escanéalo con el móvil para usar el
[asistente de configuración](#primeros-pasos-el-asistente-de-configuración). Al terminar, la pantalla muestra un
**código de vinculación**: vincúlala desde el móvil para empezar ya, o simplemente reinicia. En una instalación todo en
uno el kiosco abre **por sí solo el enlace privado de la pantalla predeterminada**: lo lee de la carpeta de datos local
cada vez que arranca Chromium (así recoge un enlace regenerado en el siguiente reinicio);
`--url "http://localhost:3000/?screen=kitchen"` elige otra pantalla del mismo modo. Una vinculación sola no sobrevive a
un reinicio ahí: el navegador del kiosco va en modo incógnito.

### B. Servidor en otra máquina, la Pi solo lo muestra (solo kiosco)

Ejecuta el servidor en un servidor doméstico, NAS o host Docker ([Inicio rápido](#inicio-rápido)) y después, en la Pi:

```bash
git clone https://github.com/mr-reb00t/marco.git ~/marco
~/marco/deploy/install.sh --kiosk-only --url http://homeserver.lan:3000/d/3f6c0a52-9d1e-4b7a-a2c4-0e5b8f1d2c37
sudo reboot
```

Usa el **enlace privado** de la pantalla que debe mostrar esta Pi: en *Pantalla → Ajustes → Enlace privado* tienes el
comando exacto listo para copiar (el enlace decide la pantalla). Aquí no sirve vincular con código: el navegador del
kiosco va en modo incógnito y lo olvidaría en el siguiente reinicio.

Esto instala solo Chromium + el inicio automático del kiosco (sin Node.js ni servidor), copia el script del kiosco a
`~/.local/bin/` (después puedes borrar el clon), desactiva el apagado de pantalla y oculta el cursor.
En el modo de acceso **abierto** sigue funcionando `--url "http://homeserver.lan:3000/?screen=kitchen"`.

### Opciones del instalador

| Opción | Significado |
|---|---|
| *(ninguna)* | Servidor + kiosco en esta máquina |
| `--no-kiosk` | Solo servidor (sin Chromium ni inicio automático) |
| `--kiosk-only --url <url>` | Solo kiosco, mostrando un servidor que se ejecuta en otra máquina |
| `--url <url>` | Todo en uno, pero mostrando una URL concreta (p. ej. el enlace privado `http://localhost:3000/d/<clave>?lite=1`) |
| `--user <name>` | Usuario que ejecuta el servicio y la sesión de escritorio (por defecto: el usuario actual) |
| `--skip-apt` | No instala paquetes del sistema |

### Consejos para el kiosco

- La configuración del kiosco está en `~/.config/marco/kiosk.env` (`KIOSK_URL`, `KIOSK_CLIENT`,
  `KIOSK_EXTRA_ARGS`); tras *Regenerar enlace*, pon el enlace privado nuevo en `KIOSK_URL` (o vuelve a ejecutar el
  instalador con `--url <enlace nuevo>`); el registro es `/tmp/marco-kiosk.log`. El script espera al servidor, reinicia
  Chromium si se cierra y añade `client=<hostname>` para que el dispositivo conserve su nombre en *Pantallas
  conectadas*.
- **¿Demasiado grande o demasiado pequeño?** Añade `KIOSK_EXTRA_ARGS="--force-device-scale-factor=0.8"` (o `1.25`) a
  `kiosk.env`. La pantalla también tiene un ajuste de escala de texto por pantalla.
- **Burbuja de traducción**: la página declara `translate="no"` y el kiosco arranca Chromium con
  `--disable-features=Translate`, así que Chromium no debería ofrecer traducir el calendario.
- **Apagar la pantalla por la noche**: `deploy/screen-schedule.sh off|on` desde cron (consulta la cabecera del script),
  o simplemente usa el modo noche con atenuación desde la administración.
- **Pi lenta**: pon el efecto ambiental en *ninguno* y la transición en *fundido*, o usa `?lite=1` en `KIOSK_URL`.
- **Sistema de archivos de solo lectura (overlay)**: si proteges la tarjeta SD con el sistema de archivos overlay de
  Raspberry Pi OS, los cambios que hace el instalador se pierden al reiniciar. Desactívalo, instala y vuelve a
  activarlo:

  ```bash
  sudo raspi-config nonint disable_overlayfs && sudo reboot
  ./deploy/install.sh ...            # o --kiosk-only --url ...
  sudo raspi-config nonint enable_overlayfs && sudo reboot
  ```

  Con el overlay activado, mantén el *servidor* (y su carpeta `data/`) en otra máquina (topología B).

Comandos útiles: `journalctl -u marco -f` (registros), `sudo systemctl restart marco`,
`git pull && ./deploy/install.sh` (actualizar).

## Conectar Google Calendar

Tienes dos opciones. **OAuth** (recomendado) ofrece actualizaciones casi en tiempo real y te permite elegir los
calendarios de una lista; la **dirección secreta iCal** no necesita ninguna configuración, pero se actualiza despacio.
Ambas son de solo lectura.

### 1. Crea un proyecto de Google Cloud y un cliente OAuth

1. Ve a <https://console.cloud.google.com/>, inicia sesión y **crea un proyecto** (p. ej. `marco`).
2. **APIs y servicios → Biblioteca** (*APIs & Services → Library*) → busca **Google Calendar API** → **Habilitar**
   (*Enable*).
3. Abre **Google Auth Platform** (antes "Pantalla de consentimiento de OAuth"):
   - **Marca** (*Branding*): nombre de la app (p. ej. *Marco*), tu email de asistencia y el email de contacto
     del desarrollador. Guarda.
   - **Público** (*Audience*): tipo de usuario **Externo** (*External*). En **Usuarios de prueba** (*Test users*) añade
     tu propia dirección de Google (y la de cualquier otra persona cuyos calendarios quieras vincular).
   - **Acceso a datos** (*Data access*, opcional): puedes añadir los permisos (scopes) `openid`, `email`, `profile` y
     `https://www.googleapis.com/auth/calendar.readonly`; Marco los solicita de todas formas.
4. **Clientes → Crear cliente → Aplicación web** (*Clients → Create client → Web application*):
   - **URI de redireccionamiento autorizados** (*Authorized redirect URIs*): `<PUBLIC_URL>/auth/google/callback`,
     exactamente, p. ej. `http://localhost:3000/auth/google/callback` o
     `https://calendar.example.com/auth/google/callback` (mismo esquema, host y puerto, sin barra final).
   - Créalo y copia el **ID de cliente** (*Client ID*) y el **Secreto del cliente** (*Client secret*).
5. Ponlos en `.env` y reinicia:

   ```ini
   PUBLIC_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   ```

   `sudo systemctl restart marco` (o `docker compose up -d` / reinicia `npm start`).

> **Pruebas frente a producción.** Mientras el estado de publicación de la app sea **Prueba** (*Testing*), solo los
> usuarios de prueba pueden iniciar sesión y Google **hace caducar los tokens de actualización a los 7 días**: los
> calendarios de Google dejan de actualizarse al cabo de una semana hasta que vuelvas a pulsar *Conectar*. Para uso
> personal no pasa nada si no te importa volver a conectar cada semana. Para evitarlo, **publica** la app (*Público →
> Publicar app*). Google exige entonces una URL de página principal y de política de privacidad en un dominio
> autorizado y, como la app no está verificada, verás una pantalla de "app no verificada" al vincular tu cuenta
> (*Configuración avanzada → Ir a … (no seguro)*). Marco solo pide acceso de lectura.

### 2. El problema del URI de redireccionamiento (y tres formas de resolverlo)

Google solo acepta URI de redireccionamiento en **dominios públicos con `https://`** o en **`http://localhost`**. Una
dirección de la red local como `http://192.168.1.50:3000/auth/google/callback` se rechaza (`redirect_uri_mismatch` /
"redireccionamiento no válido"). Elige una de estas opciones:

**Opción A — `localhost` solo para vincular (la más sencilla).** Define `PUBLIC_URL=http://localhost:3000` y registra
`http://localhost:3000/auth/google/callback`. Después abre la administración *como localhost* solo cuando vayas a
vincular una cuenta: en el propio servidor o desde tu portátil a través de un túnel SSH:

```bash
ssh -L 3000:localhost:3000 user@<server-ip>
# después abre http://localhost:3000/admin/ en tu portátil y pulsa "Vincular cuenta"
```

El token de actualización se guarda en el servidor y se renueva automáticamente, así que el resto del tiempo usas la
administración con normalidad en `http://<server-ip>:3000/admin/` (solo "Iniciar sesión con Google" necesita la URL de
localhost).

**Opción B — tu propio dominio con HTTPS.** Pon delante un proxy inverso con un certificado válido, define
`PUBLIC_URL=https://calendar.example.com` y registra `https://calendar.example.com/auth/google/callback`.

- **Caddy** (Let's Encrypt automático): consulta [`deploy/Caddyfile.example`](deploy/Caddyfile.example). Solo expone a
  Internet las rutas de administración, inicio de sesión y configuración inicial (más `/assets` y `/media`); la
  pantalla y su API solo responden a direcciones de la red local. Las fotos de la galería en `/media/` pasan por el
  proxy, pero el servidor solo las envía a clientes de la red local o a un administrador con sesión iniciada.

  ```bash
  sudo apt install caddy
  sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile   # edita el dominio
  sudo systemctl reload caddy
  ```

- **Cloudflare Tunnel** (sin abrir puertos): `cloudflared tunnel create calendar`, dirige `calendar.example.com` a
  `http://localhost:3000` en la configuración del túnel y, si quieres, protégelo con Cloudflare Access. Los
  Server-Sent Events funcionan a través del túnel.
- Define **`TRUST_PROXY`** siempre que el proxy no se conecte desde `127.0.0.1`: un proxy en **otra máquina**
  (`TRUST_PROXY=<proxy-ip>`) o **cualquier proxy delante del contenedor Docker** (`TRUST_PROXY=172.16.0.0/12`, el
  bridge de Docker). Sin él, el servidor ve la dirección del proxy en lugar de la del visitante: todo el que pasa por
  él se trata como remoto (se exige el token de configuración y se rechaza lo que es solo para la red local) y la
  cookie de sesión no se marca `Secure`. El registro avisa de un proxy no fiable cuando ocurre.

**Opción C — sin OAuth: la dirección secreta iCal.** En Google Calendar en la web → ⚙️ *Configuración* → elige el
calendario → *Integrar el calendario* → **Dirección secreta en formato iCal** (*Secret address in iCal format*). Añade
esa URL como fuente **iCal**. No necesitas ningún proyecto de Google Cloud; sin embargo, Google actualiza esta fuente
con retraso (de minutos a horas) y cualquiera que tenga la URL puede leer el calendario: trátala como una contraseña.

### 3. Elige tus calendarios

**Administración → Calendarios → Cuentas de Google → Vincular cuenta**, acepta los permisos y marca los calendarios que
quieres mostrar. Cada uno se convierte en una fuente a la que puedes cambiar el nombre y asignar un emoji, un color y un
**tipo**: p. ej., un calendario que solo contiene cumpleaños → tipo *Cumpleaños* (🎂 y edades), un calendario de
festivos → *Festivos*. Puedes vincular varias cuentas de Google.

**Iniciar sesión con Google** en la administración: añade las direcciones permitidas en **Seguridad → Emails de Google
permitidos** (si la lista está vacía, el primer inicio de sesión con Google que hagas mientras ya tienes la sesión
iniciada con la contraseña se añade solo). Después, si quieres, puedes desactivar el inicio de sesión con contraseña.

## Otras integraciones

- **Fuentes iCal / ICS** — cualquier URL `http(s)://` o `webcal://`: colegio, club deportivo, trabajo, festivos
  (conjuntos predefinidos para varios países en *Calendarios → Añadir rápido*), plataformas de alquiler vacacional.
  *Probar* muestra cuántos eventos se han leído. Si la fuente usa un **certificado autofirmado**, activa *Certificado
  autofirmado* solo en esa fuente (o añade tu CA con `NODE_EXTRA_CA_CERTS`). Una fuente que falla nunca rompe las
  demás; los errores aparecen en *Estado* y *Actividad*.
- **Alquileres vacacionales** — establece el tipo en *Alquiler vacacional*. Las entradas "Reserved" / "Not available"
  de Airbnb se convierten en barras "Reserva · Huésped" (las fechas bloqueadas se pueden ocultar con un filtro); las
  fuentes que ya formatean los títulos como `🏠 Guest - 4p+1m` conservan su emoji y convierten el número de huéspedes en
  iconos; las líneas `Adults: 2 / Children: 1 / Infants: 1 / Pets: 1` de la descripción (también
  `Adultos/Niños/Bebés/Mascotas`) dan 🧑🏻🧑🏻 🧒🏻 👶🏻 🐶.
- **Tiempo** — [Open-Meteo](https://open-meteo.com/), sin clave: basta con definir la ubicación (búsqueda por nombre o
  coordenadas) y las unidades en *Tiempo*.
- **Home Assistant** — en Home Assistant abre tu **perfil → Seguridad → Tokens de acceso de larga duración → Crear
  token**; en *Administración → Home Assistant* introduce la URL (p. ej. `http://homeassistant.local:8123`) y el token,
  pulsa *Probar conexión* y, después, elige en *Tiempo* una entidad `weather.*` y/o entidades `sensor.*` de temperatura
  y humedad interiores. El token se queda en el servidor. Home Assistant también puede **enviar avisos** a las
  pantallas; consulta [webhooks](#tokens-de-api-y-webhooks).
- **Noticias (RSS/Atom)** — añade cualquier fuente en *Noticias*. Algunos sitios bloquean los clientes que no son
  navegadores; el servidor ya usa el User-Agent de un navegador de escritorio. Usa *Probar* para comprobar una fuente.

## Fotos

- Las fotos de **stock** vienen de [picsum.photos](https://picsum.photos/) (gratis, sin clave). **Galería** usa tus
  propias fotos; **Mixto** alterna ambas. Configura el intervalo, el brillo, la transición y el efecto ambiental en
  *Fondo*.
- **Orden de las fotos** (*Fondo*): *Aleatorio* (al azar, sin repetir las fotos de la tanda anterior), *Más
  recientes primero* o *Por nombre*. Los órdenes secuenciales siguen donde lo dejó la pantalla y vuelven a empezar al
  terminar.
- **Elige qué fotos se muestran**: cada foto de la galería tiene un botón con un ojo para sacarla de la rotación (o
  devolverla) sin borrarla. El contador indica cuántas están en rotación; filtra por *En rotación* / *Ocultas* y usa
  *Seleccionar* para mostrar u ocultar muchas fotos a la vez. Si todas las fotos de la galería están ocultas, la
  pantalla usa fotos de stock.
- Sube fotos en **Administración → Galería** arrastrándolas y soltándolas (JPG, PNG, WebP, AVIF, GIF… y **HEIC** del
  iPhone, hasta 100 MB cada una). Las fotos se optimizan **en tu navegador** antes de subirlas —se giran según los
  datos EXIF, se redimensionan a un máximo de 2560 px y se guardan como JPEG, con una miniatura de 480 px—, así que ni
  el servidor ni la Pi tienen que procesar imágenes.
- El **punto focal** se detecta automáticamente (prominencia visual + tonos de piel). Haz clic en una foto para
  ajustarlo: el editor muestra exactamente lo que recortarán el panel lateral y los diseños a pantalla completa,
  incluidas las franjas que tapan el reloj y el tiempo.
- Consejo: las **fotos en vertical** encajan mejor en el panel lateral del diseño *calendario grande*; las fotos en
  horizontal lucen en *hora grande* y *izquierda/derecha*.
- Si subes un archivo con un nombre que ya existe, se te pregunta si quieres sustituirlo, conservar ambos u omitirlo.
  Las fotos copiadas a mano en `data/photos/` se pueden optimizar más tarde con *Optimizar y encuadrar fotos
  existentes*.

## Varias pantallas, avisos y la API

### Pantallas y pantallas conectadas

Crea varias **pantallas** en *Sistema → Pantallas* ("Salón", "Cocina", "Pasillo"…). Cada una tiene su propio diseño,
tema, fondo, widgets y conjunto de calendarios; los calendarios, las reglas y las integraciones son compartidos. Un
dispositivo muestra una pantalla con su [enlace privado](#enlaces-privados-y-vinculación-de-pantallas) o vinculándolo a
ella (en modo abierto también con `http://<server-ip>:3000/?screen=<slug>`; sin `?screen`, la predeterminada ★). El selector **Editando: Salón ▾** de la cabecera de la administración elige qué pantalla editan las páginas que
se configuran por pantalla.

*Sistema → Pantallas conectadas* muestra todos los navegadores que están mostrando una pantalla (IP, navegador,
resolución, densidad de píxeles, WebGL, versión, último latido y cómo entró: enlace privado, dispositivo vinculado o
sin clave) con los botones **Recargar**, **Identificar** (muestra el nombre de la pantalla en letras grandes durante
10 s) y **Noche / Día / Auto**, además de **Vincular una pantalla** y la lista de dispositivos vinculados. Las
pantallas desactualizadas se señalan; *Recargar* las arregla.

### Avisos y mensajes programados

*Avisos → Enviar aviso ahora*: título, texto, emoji, estilo (*info*, *éxito*, *advertencia*, *urgente*), duración,
sonido y pantallas de destino. Los avisos activos sobreviven a un reinicio del servidor. Los *Mensajes programados*
aparecen a horas fijas en los días de la semana elegidos (las franjas pueden cruzar la medianoche).

### Tokens de API y webhooks

Crea un token en *Administración → API y webhooks* (se muestra una sola vez; solo se guarda un hash). Después, desde
Home Assistant:

```yaml
# configuration.yaml
rest_command:
  marco_alert:
    url: "http://192.168.1.50:3000/api/hooks/announce"
    method: POST
    headers:
      Authorization: "Bearer cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    content_type: "application/json"
    payload: >-
      {"title": {{ title | tojson }}, "body": {{ (body | default('')) | tojson }},
       "emoji": {{ (emoji | default('🔔')) | tojson }}, "style": "{{ style | default('info') }}",
       "durationSec": {{ duration | default(120) }}, "sound": true}

automation:
  - alias: "Aviso: lavadora terminada"
    triggers:
      - trigger: state
        entity_id: sensor.washing_machine_status
        to: "finished"
    actions:
      - action: rest_command.marco_alert
        data:
          title: "La lavadora ha terminado 🧺"
          emoji: "🧺"
          style: "success"
          duration: 300
```

O con `curl`:

```bash
TOKEN=cs_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
curl -H "Authorization: Bearer $TOKEN" http://192.168.1.50:3000/api/hooks/ping
# aviso urgente en la pantalla de la cocina durante 10 minutos
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"¡Horno encendido!","emoji":"🔥","style":"urgent","durationSec":600,"sound":true,"screens":["kitchen"]}' \
  http://192.168.1.50:3000/api/hooks/announce
# recargar todas las pantallas / modo noche on|off|auto
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' http://192.168.1.50:3000/api/hooks/reload
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"mode":"on"}' http://192.168.1.50:3000/api/hooks/night
```

Límites: 30 peticiones por minuto por token; errores `401` (token incorrecto), `400` (datos no válidos), `415` (no es
JSON), `429` (límite de peticiones). Referencia completa: [docs/API.md](docs/API.md).

### Copias de seguridad y actividad

- Cada vez que guardas, se conserva la configuración anterior en `data/backups/` (las 20 más recientes; varios
  guardados seguidos cuentan como uno). *Sistema → Copias de seguridad* permite descargarlas, restaurarlas o borrarlas
  y crear copias manuales.
- **Exportar** descarga todo en un único archivo JSON, opcionalmente con los secretos (hash de la contraseña, token de
  Home Assistant, cuentas de Google, tokens de API: guárdalo en un lugar seguro). **Importar** muestra qué cambia en
  cada sección antes de aplicarlo.
- *Sistema → Actividad* registra los inicios de sesión (y los intentos fallidos), los guardados, las restauraciones,
  los avisos, el uso de la API, las conexiones de pantallas y los errores de calendarios. Las contraseñas, los tokens
  y las URL de los calendarios nunca se registran.

## Referencia de configuración

### Variables de entorno (`.env`)

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `HOST` | `0.0.0.0` | Dirección en la que escucha |
| `PUBLIC_URL` | se deduce de cada petición | URL de la administración a través de tu dominio, usada para la redirección de Google OAuth `${PUBLIC_URL}/auth/google/callback`; su host también se acepta en la comprobación de nombres de host |
| `ALLOWED_HOSTS` | — | Nombres de host adicionales a los que responde el servidor, separados por comas (`.example.com` = también subdominios). Las IP, `localhost`, los nombres de una etiqueta y `*.local`/`*.lan`/`*.home.arpa`/`*.internal` funcionan siempre; el resto recibe `421` (protección contra DNS rebinding) |
| `SESSION_SECRET` | aleatorio (guardado en `data/secrets.json`) | Secreto que firma la cookie de sesión |
| `SETUP_TOKEN` | — | Exige este token (al menos 16 caracteres) para usar el asistente de configuración inicial (`/admin/?setup=<token>`). Sin él, el asistente funciona desde la red local y, desde fuera, pide el token que se escribe en el registro en cada arranque |
| `SETUP_REQUIRE_TOKEN` | — (`1` en Docker) | `1` = el asistente pide siempre el token del registro, también desde la red local |
| `ADMIN_PASSWORD` | — | Solo instalaciones sin navegador: contraseña inicial en lugar del asistente (se usa hasta que se guarda una contraseña; el panel propone cambiarla). Un valor que no cumple las reglas del asistente (menos de 10 caracteres o una contraseña común) solo funciona desde la red local y hay que cambiarlo |
| `LAN_ADDRESS` | detectada | Dirección de este servidor en la red local para el código QR de bienvenida de la pantalla (defínela en Docker, donde no se puede detectar) |
| `DATA_DIR` | `./data` (`/data` en Docker) | Dónde se guardan la configuración, los secretos, las fotos y las copias de seguridad |
| `COOKIE_SECURE` | según la petición | `1` = cookie siempre `Secure`, `0` = nunca |
| `TRUST_PROXY` | `loopback` | IP o rangos de los proxies inversos que pueden definir `X-Forwarded-*`. Necesario para un proxy en otro host y para cualquier proxy delante de Docker (`172.16.0.0/12`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Cliente OAuth de Google ([guía](#conectar-google-calendar)) |
| `NODE_EXTRA_CA_CERTS` | — | Certificados de CA adicionales para fuentes iCal con una CA privada |
| `TZ` | la zona de *Fecha y hora* (sigue los cambios al momento) | Zona horaria del proceso (usada para las horas iCal "flotantes"). Definirla aquí la fija |

Con Docker Compose solo llegan al contenedor las variables que aparecen en `docker-compose.yml`; el `.env` de al lado
les da valor.

### Directorio de datos

```
data/
├── config.json          # todos los ajustes (pantallas, calendarios, reglas, eventos, cumpleaños…)
├── secrets.json         # hash de la contraseña, secreto de sesión, tokens de Google y Home Assistant, hashes de los tokens de API,
│                        #   claves de los enlaces privados, hashes de las llaves de los dispositivos vinculados (modo 600)
├── photos/              # galería (+ .thumbs/ y .meta.json con los puntos focales y las fotos ocultas)
├── backups/             # copias de seguridad de la configuración automáticas y manuales
├── cache/               # cachés de las fuentes
├── activity.jsonl       # registro de actividad
├── announcements.json   # avisos activos + historial
└── displays.json        # pantallas conocidas
```

Haz copia de seguridad de toda la carpeta (o usa *Exportar*) para conservarlo todo.

### Parámetros de URL de la pantalla

| Parámetro | Efecto |
|---|---|
| `/d/<clave>` | Enlace privado de una pantalla (la clave decide la pantalla) |
| `/pair` | Muestra un código de vinculación (también en modo abierto) |
| `?screen=<slug>` | Muestra ese perfil de pantalla (la predeterminada si no se indica o no existe); solo en modo abierto o con sesión del panel |
| `?lite=1` | Sin efectos WebGL (dispositivos lentos) |
| `?demo=1` | Datos de ejemplo integrados (no necesita datos del servidor) |
| `?lang=en\|es\|pt` | Fuerza el idioma |
| `?preset=…` `?view=month\|agenda\|week` `?theme=dark\|light` `?side=left\|right` `?clock=analog` | Fuerza opciones de diseño (útil para hacer pruebas) |
| `?client=<name>` | Nombre de este dispositivo en *Pantallas conectadas* (lo define el script del kiosco) |

## Seguridad

Marco se diseñó para una red doméstica; desde la 0.3 las pantallas son **privadas por defecto**.

- **Pantallas** (`/`, `/d/<clave>` y la API de la pantalla: `/api/display/*`, `/api/events`, `/api/weather`,
  `/api/news`, `/api/photos`, `/api/countdowns`, `/api/stream`, `/media/*`): necesitan la clave del enlace privado, la
  llave de un dispositivo vinculado o una sesión del panel; si no, responden `401`/`403` sin datos. Las claves se
  comparan en tiempo constante, nunca se registran y no salen en el referer (`Referrer-Policy: no-referrer`) ni en
  cachés (`no-store`). En modo **abierto** (instalaciones actualizadas desde la 0.2 hasta que lo cambies) la API de la
  pantalla no pide nada: entonces **no la expongas a Internet**.
- **Protegido**: la administración (`/admin/`, `/api/admin/*`) requiere una sesión (contraseña y/o cuentas de Google
  permitidas); los webhooks requieren un token de tipo bearer.
- Una instalación nueva **no tiene contraseña por defecto**; la crea el
  [asistente de configuración](#primeros-pasos-el-asistente-de-configuración). Define `SETUP_TOKEN` si el servidor es
  accesible desde fuera de tu red local antes de terminar la configuración.
- Los nombres de host desconocidos se rechazan (protección contra DNS rebinding); añade tu dominio con `PUBLIC_URL` /
  `ALLOWED_HOSTS`.
- Si quieres acceso remoto, usa un **proxy inverso con HTTPS** ([ejemplo de Caddy](deploy/Caddyfile.example)): en modo
  privado las pantallas también pueden pasar por él; en modo abierto expón solo las rutas de administración, inicio de
  sesión y configuración inicial. Usa una **contraseña segura** y `TRUST_PROXY` siempre que el proxy no se conecte
  desde loopback (otro host o Docker). En redes que no controlas, usa HTTPS para que nadie pueda capturar una clave.
- Las URL de calendarios, RSS y Home Assistant que introduces en la administración las descarga **el servidor**,
  direcciones de la red local incluidas.
- Mantén en privado `.env`, `data/secrets.json`, las exportaciones con secretos y `data/backups/`.

Consulta [SECURITY.md](SECURITY.md) para informar de una vulnerabilidad.

## Desarrollo

```bash
npm ci
npm run dev          # servidor en :3000 (node --watch) + Vite en :5173 (hace de proxy de /api, /auth, /media)
                     # pantalla http://localhost:5173/  ·  administración http://localhost:5173/admin/
npm test             # tests del servidor (node --test)
npm run typecheck    # TypeScript (pantalla + administración)
npm run build        # compilación de producción en dist/
```

| Carpeta | Contenido |
|---|---|
| `server/` | API con Express 5, JavaScript ESM sin más, sin paso de compilación (`routes/`, `lib/`, `test/`) |
| `web/display/` | La pantalla: TypeScript sin frameworks + three.js |
| `web/admin/` | El panel de administración: Preact + TypeScript |
| `web/shared/` | Tipos compartidos, i18n, reglas de emojis, recorte por punto focal |
| `deploy/` | Instalador para Raspberry Pi, unidad de systemd, scripts del kiosco y del horario de pantalla, ejemplo de Caddy |
| `scripts/demo.js` | `npm run demo` |
| `docs/` | [Arquitectura](docs/ARCHITECTURE.md), [API](docs/API.md), capturas de pantalla |

Las contribuciones son bienvenidas: lee [CONTRIBUTING.md](CONTRIBUTING.md). Notas de versión: [CHANGELOG.md](CHANGELOG.md).

## Licencia

[MIT](LICENSE) © 2026 colaboradores de Marco. Los componentes de terceros mantienen sus propias licencias, en
particular el decodificador HEIC (LGPL-3.0, cargado como un fragmento independiente sin modificar) y las fuentes Inter /
Outfit (OFL-1.1); consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Agradecimientos

- [DAKboard](https://dakboard.com/), por la idea de un panel de pared bonito (este proyecto no está afiliado a él).
- [Open-Meteo](https://open-meteo.com/): API meteorológica gratuita (datos bajo CC BY 4.0).
- [Lorem Picsum](https://picsum.photos/) y los fotógrafos de Unsplash, por las fotos de stock.
- [three.js](https://threejs.org/), [Preact](https://preactjs.com/), [Vite](https://vite.dev/),
  [Express](https://expressjs.com/), [node-ical](https://github.com/jens-maus/node-ical), [rrule](https://github.com/jkbrzt/rrule),
  [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), [heic-to](https://github.com/hoppergee/heic-to),
  [Inter](https://rsms.me/inter/) y [Outfit](https://fonts.google.com/specimen/Outfit).
