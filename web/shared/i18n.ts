// i18n + date helpers shared by the display and the admin panel (es default, en, pt, nl, da).
import type { DateFormat, Lang } from './types';

export const LANGS: Lang[] = ['es', 'en', 'pt', 'nl', 'da'];
export const LOCALES: Record<Lang, string> = { es: 'es-ES', en: 'en-GB', pt: 'pt-PT', nl: 'nl-NL', da: 'da-DK' };
/** Each language's own name, for language pickers. */
export const LANG_NAMES: Record<Lang, string> = { es: 'Español', en: 'English', pt: 'Português', nl: 'Nederlands', da: 'Dansk' };

type Dict = Record<string, string>;

const es: Dict = {
  // layouts with their own view (web/display/widgets/views.ts)
  upNext: 'A continuación',
  nothingMoreToday: 'Nada más por hoy',
  firstTomorrow: 'Mañana',
  everyone: 'Todos',
  birthdays: 'Cumpleaños',
  agenda: 'Agenda',
  allDone: 'Todo hecho',
  noPeople: 'Elige los calendarios de cada persona en Diseño',
  nothingPlanned: 'Nada previsto',
  daysWord: 'días',
  today: 'Hoy',
  tomorrow: 'Mañana',
  yesterday: 'Ayer',
  now: 'Ahora',
  allDay: 'Todo el día',
  more: '+{n} más',
  dayXofY: 'Día {x} de {y}',
  checkIn: 'Entrada',
  checkOut: 'Salida',
  privateMode: 'Modo privado',
  widgetStale: 'sin actualizar',
  priceTitle: 'Precio de la luz',
  priceCheap: 'Barato',
  priceMid: 'Normal',
  priceHigh: 'Caro',
  priceNextHour: 'Próxima hora {p}',
  priceCheapestHours: 'Horas más baratas',
  priceCheapestStretches: 'Franjas de {n} h más baratas',
  priceNoneLeft: 'No quedan franjas por delante',
  priceRange: '{a} a {b}',
  priceMinMax: 'Mín. {a} · Máx. {b}',
  priceNowIs: 'Ahora: {l}',
  priceLowest: 'Más bajo',
  priceAverage: 'Media',
  priceHighest: 'Más alto',
  priceNextHours: 'Próximas {n} h',
  priceInclGrid: 'Con tarifa de red',
  priceInclGridEst: 'Con tarifa de red (estimada)',
  priceInclBands: 'Con tramos horarios',
  priceNoGrid: 'Sin tarifa de red',
  priceLoading: 'Cargando precios…',
  priceLoadingGrid: 'Cargando tarifa de {c}…',
  widgetNone: 'Elige un widget en Diseño',
  widgetSaveToSee: 'Se verá al guardar',
  inMinutes: 'En {n} min',
  inHours: 'En {n} h',
  inHoursMinutes: 'En {h} h {m} min',
  inDays: 'En {n} días',
  happeningNow: 'Ahora',
  untilTime: 'hasta las {t}',
  next: 'Próximo',
  noEvents: 'Sin eventos',
  noUpcoming: 'Nada en la agenda',
  feelsLike: 'Sensación',
  hiShort: 'Máx.',
  loShort: 'Mín.',
  humidity: 'Humedad',
  wind: 'Viento',
  sunrise: 'Amanecer',
  sunset: 'Atardecer',
  precip: 'Lluvia',
  indoor: 'Casa',
  uv: 'UV',
  pressure: 'Presión',
  news: 'Noticias',
  todo: 'Tareas',
  offline: 'Sin conexión',
  photoBy: 'Foto: {a}',
  week: 'Semana',
  todayEvents: 'Hoy',
  upcoming: 'Próximos días',
  loading: 'Cargando…',
  countdowns: 'Cuentas atrás',
  cdDays: 'Faltan {n} días',
  cdTomorrow: '¡Mañana!',
  cdToday: '¡Hoy!',
  screenNotFound: 'Pantalla no encontrada',
  screenNotChosen: 'Abre el enlace de una pantalla',
  identifyScreen: 'Pantalla',
  identifyDevice: 'Dispositivo',
  carouselShowing: '{name} · ahora: {screen}',
  doorbell: 'Puerta',
  doorbellRinging: 'Llaman a la puerta',
  doorbellNoPicture: 'Cámara no disponible',
  until: 'hasta las {t}',
  nightOn: 'Modo noche',
  // kids layouts (web/display/widgets/kids.ts)
  kidsMorning: 'Mañana',
  kidsAfternoon: 'Tarde',
  kidsEvening: 'Noche',
  kidsAnytime: 'Durante el día',
  kidsAllDone: '¡Todo hecho!',
  kidsScan: 'Marca tus rutinas desde el móvil',
  kidsNone: 'Hoy no hay rutinas',
  kidsNoMembers: 'Añade a la familia en el panel, sección Familia',
  kidsRoutines: 'Rutinas',
  kidsMealsToday: 'Comidas de hoy',
  kidsMealsWeek: 'Menú de la semana',
  kidsMealsOff: 'Activa los menús en el panel, sección Menús',
  meal_breakfast: 'Desayuno',
  meal_lunch: 'Comida',
  meal_snack: 'Merienda',
  meal_dinner: 'Cena',
  greetMorning: 'Buenos días',
  greetAfternoon: 'Buenas tardes',
  greetEvening: 'Buenas noches',
  kidsEventsLeft: 'Quedan {n} eventos hoy',
  kidsEventsLeft1: 'Queda 1 evento hoy',
  kidsNoEventsLeft: 'No quedan eventos hoy',
  kidsRoutinesDone: '{done} de {total} rutinas hechas',
  kidsRewards: 'Premios',
  kidsStarsLeft: 'Faltan {n} ⭐',
  kidsStarsLeft1: 'Falta 1 ⭐',
  kidsLeft: '{n} por hacer',
  kidsRewardReady: '¡Ya lo puede canjear!',
  kidsTasks: 'Tareas',
  kidsNoMeal: '·',
  kidsNoMealsDay: 'Sin menú para hoy',
  kidsPrivate: 'Las rutinas vuelven cuando acabe el modo privado',
};

const en: Dict = {
  // layouts with their own view (web/display/widgets/views.ts)
  upNext: 'Up next',
  nothingMoreToday: 'Nothing else today',
  firstTomorrow: 'Tomorrow',
  everyone: 'Everyone',
  birthdays: 'Birthdays',
  agenda: 'Agenda',
  allDone: 'All done',
  noPeople: 'Choose each person’s calendars in Layout',
  nothingPlanned: 'Nothing planned',
  daysWord: 'days',
  today: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  now: 'Now',
  allDay: 'All day',
  more: '+{n} more',
  dayXofY: 'Day {x} of {y}',
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  privateMode: 'Private mode',
  widgetStale: 'not updated',
  priceTitle: 'Electricity price',
  priceCheap: 'Cheap',
  priceMid: 'Normal',
  priceHigh: 'Expensive',
  priceNextHour: 'Next hour {p}',
  priceCheapestHours: 'Cheapest hours',
  priceCheapestStretches: 'Cheapest {n} h windows',
  priceNoneLeft: 'No windows left',
  priceRange: '{a} to {b}',
  priceMinMax: 'Min {a} · Max {b}',
  priceNowIs: 'Now: {l}',
  priceLowest: 'Lowest',
  priceAverage: 'Average',
  priceHighest: 'Highest',
  priceNextHours: 'Next {n} h',
  priceInclGrid: 'Incl. grid tariff',
  priceInclGridEst: 'Incl. grid tariff (estimated)',
  priceInclBands: 'Incl. time bands',
  priceNoGrid: 'Without grid tariff',
  priceLoading: 'Loading prices…',
  priceLoadingGrid: 'Loading {c} tariff…',
  widgetNone: 'Choose a widget in Layout',
  widgetSaveToSee: 'Shows after saving',
  inMinutes: 'In {n} min',
  inHours: 'In {n} h',
  inHoursMinutes: 'In {h} h {m} min',
  inDays: 'In {n} days',
  happeningNow: 'Now',
  untilTime: 'until {t}',
  next: 'Next',
  noEvents: 'No events',
  noUpcoming: 'Nothing scheduled',
  feelsLike: 'Feels like',
  hiShort: 'H',
  loShort: 'L',
  humidity: 'Humidity',
  wind: 'Wind',
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  precip: 'Rain',
  indoor: 'Home',
  uv: 'UV',
  pressure: 'Pressure',
  news: 'News',
  todo: 'To-do',
  offline: 'Offline',
  photoBy: 'Photo: {a}',
  week: 'Week',
  todayEvents: 'Today',
  upcoming: 'Coming up',
  loading: 'Loading…',
  countdowns: 'Countdowns',
  cdDays: 'In {n} days',
  cdTomorrow: 'Tomorrow!',
  cdToday: 'Today!',
  screenNotFound: 'Screen not found',
  screenNotChosen: 'Open a screen\'s link',
  identifyScreen: 'Screen',
  identifyDevice: 'Device',
  carouselShowing: '{name} · now: {screen}',
  doorbell: 'Door',
  doorbellRinging: 'Someone is at the door',
  doorbellNoPicture: 'Camera unavailable',
  until: 'until {t}',
  nightOn: 'Night mode',
  // kids layouts (web/display/widgets/kids.ts)
  kidsMorning: 'Morning',
  kidsAfternoon: 'Afternoon',
  kidsEvening: 'Evening',
  kidsAnytime: 'Any time',
  kidsAllDone: 'All done!',
  kidsScan: 'Tick off routines from your phone',
  kidsNone: 'No routines today',
  kidsNoMembers: 'Add your family in the admin, Family section',
  kidsRoutines: 'Routines',
  kidsMealsToday: "Today's meals",
  kidsMealsWeek: "This week's meals",
  kidsMealsOff: 'Turn on meals in the admin, Meals section',
  meal_breakfast: 'Breakfast',
  meal_lunch: 'Lunch',
  meal_snack: 'Snack',
  meal_dinner: 'Dinner',
  greetMorning: 'Good morning',
  greetAfternoon: 'Good afternoon',
  greetEvening: 'Good evening',
  kidsEventsLeft: '{n} events left today',
  kidsEventsLeft1: '1 event left today',
  kidsNoEventsLeft: 'Nothing else today',
  kidsRoutinesDone: '{done} of {total} routines done',
  kidsRewards: 'Rewards',
  kidsStarsLeft: '{n} ⭐ to go',
  kidsStarsLeft1: '1 ⭐ to go',
  kidsLeft: '{n} to do',
  kidsRewardReady: 'Ready to redeem!',
  kidsTasks: 'To do',
  kidsNoMeal: '·',
  kidsNoMealsDay: 'No meals planned today',
  kidsPrivate: 'Routines come back when private mode ends',
};

const pt: Dict = {
  // layouts with their own view (web/display/widgets/views.ts)
  upNext: 'A seguir',
  nothingMoreToday: 'Mais nada hoje',
  firstTomorrow: 'Amanhã',
  everyone: 'Todos',
  birthdays: 'Aniversários',
  agenda: 'Agenda',
  allDone: 'Tudo feito',
  noPeople: 'Escolha os calendários de cada pessoa em Disposição',
  nothingPlanned: 'Nada previsto',
  daysWord: 'dias',
  today: 'Hoje',
  tomorrow: 'Amanhã',
  yesterday: 'Ontem',
  now: 'Agora',
  allDay: 'Todo o dia',
  more: '+{n} mais',
  dayXofY: 'Dia {x} de {y}',
  checkIn: 'Entrada',
  checkOut: 'Saída',
  privateMode: 'Modo privado',
  widgetStale: 'sem atualização',
  priceTitle: 'Preço da luz',
  priceCheap: 'Barato',
  priceMid: 'Normal',
  priceHigh: 'Caro',
  priceNextHour: 'Próxima hora {p}',
  priceCheapestHours: 'Horas mais baratas',
  priceCheapestStretches: 'Períodos de {n} h mais baratos',
  priceNoneLeft: 'Não há mais períodos',
  priceRange: '{a} às {b}',
  priceMinMax: 'Mín. {a} · Máx. {b}',
  priceNowIs: 'Agora: {l}',
  priceLowest: 'Mais baixo',
  priceAverage: 'Média',
  priceHighest: 'Mais alto',
  priceNextHours: 'Próximas {n} h',
  priceInclGrid: 'Com tarifa de rede',
  priceInclGridEst: 'Com tarifa de rede (estimada)',
  priceInclBands: 'Com períodos horários',
  priceNoGrid: 'Sem tarifa de rede',
  priceLoading: 'A carregar preços…',
  priceLoadingGrid: 'A carregar a tarifa de {c}…',
  widgetNone: 'Escolha um widget em Design',
  widgetSaveToSee: 'Aparece depois de guardar',
  inMinutes: 'Daqui a {n} min',
  inHours: 'Daqui a {n} h',
  inHoursMinutes: 'Daqui a {h} h {m} min',
  inDays: 'Daqui a {n} dias',
  happeningNow: 'Agora',
  untilTime: 'até às {t}',
  next: 'Próximo',
  noEvents: 'Sem eventos',
  noUpcoming: 'Nada agendado',
  feelsLike: 'Sensação',
  hiShort: 'Máx.',
  loShort: 'Mín.',
  humidity: 'Humidade',
  wind: 'Vento',
  sunrise: 'Nascer do sol',
  sunset: 'Pôr do sol',
  precip: 'Chuva',
  indoor: 'Casa',
  uv: 'UV',
  pressure: 'Pressão',
  news: 'Notícias',
  todo: 'Tarefas',
  offline: 'Sem ligação',
  photoBy: 'Foto: {a}',
  week: 'Semana',
  todayEvents: 'Hoje',
  upcoming: 'Próximos dias',
  loading: 'A carregar…',
  countdowns: 'Contagens',
  cdDays: 'Faltam {n} dias',
  cdTomorrow: 'Amanhã!',
  cdToday: 'Hoje!',
  screenNotFound: 'Ecrã não encontrado',
  screenNotChosen: 'Abra a ligação de um ecrã',
  identifyScreen: 'Ecrã',
  identifyDevice: 'Dispositivo',
  carouselShowing: '{name} · agora: {screen}',
  doorbell: 'Porta',
  doorbellRinging: 'Está alguém à porta',
  doorbellNoPicture: 'Câmara indisponível',
  until: 'até às {t}',
  nightOn: 'Modo noite',
  // kids layouts (web/display/widgets/kids.ts)
  kidsMorning: 'Manhã',
  kidsAfternoon: 'Tarde',
  kidsEvening: 'Noite',
  kidsAnytime: 'Durante o dia',
  kidsAllDone: 'Tudo feito!',
  kidsScan: 'Marca as rotinas no telemóvel',
  kidsNone: 'Hoje não há rotinas',
  kidsNoMembers: 'Adiciona a família no painel, secção Família',
  kidsRoutines: 'Rotinas',
  kidsMealsToday: 'Refeições de hoje',
  kidsMealsWeek: 'Ementa da semana',
  kidsMealsOff: 'Ativa as ementas no painel, secção Ementas',
  meal_breakfast: 'Pequeno-almoço',
  meal_lunch: 'Almoço',
  meal_snack: 'Lanche',
  meal_dinner: 'Jantar',
  greetMorning: 'Bom dia',
  greetAfternoon: 'Boa tarde',
  greetEvening: 'Boa noite',
  kidsEventsLeft: 'Faltam {n} eventos hoje',
  kidsEventsLeft1: 'Falta 1 evento hoje',
  kidsNoEventsLeft: 'Não há mais eventos hoje',
  kidsRoutinesDone: '{done} de {total} rotinas feitas',
  kidsRewards: 'Prémios',
  kidsStarsLeft: 'Faltam {n} ⭐',
  kidsStarsLeft1: 'Falta 1 ⭐',
  kidsLeft: '{n} por fazer',
  kidsRewardReady: 'Já pode trocar!',
  kidsTasks: 'Tarefas',
  kidsNoMeal: '·',
  kidsNoMealsDay: 'Sem ementa para hoje',
  kidsPrivate: 'As rotinas voltam quando o modo privado acabar',
};

const nl: Dict = {
  // layouts with their own view (web/display/widgets/views.ts)
  upNext: 'Straks',
  nothingMoreToday: 'Verder niets vandaag',
  firstTomorrow: 'Morgen',
  everyone: 'Iedereen',
  birthdays: 'Verjaardagen',
  agenda: 'Agenda',
  allDone: 'Alles klaar',
  noPeople: 'Kies de agenda\'s van elke persoon in Indeling',
  nothingPlanned: 'Niets gepland',
  daysWord: 'dagen',
  today: 'Vandaag',
  tomorrow: 'Morgen',
  yesterday: 'Gisteren',
  now: 'Nu',
  allDay: 'Hele dag',
  more: '+{n} meer',
  dayXofY: 'Dag {x} van {y}',
  checkIn: 'Inchecken',
  checkOut: 'Uitchecken',
  privateMode: 'Privémodus',
  widgetStale: 'niet bijgewerkt',
  priceTitle: 'Stroomprijs',
  priceCheap: 'Goedkoop',
  priceMid: 'Normaal',
  priceHigh: 'Duur',
  priceNextHour: 'Volgend uur {p}',
  priceCheapestHours: 'Goedkoopste uren',
  priceCheapestStretches: 'Goedkoopste periodes van {n} uur',
  priceNoneLeft: 'Geen periodes meer over',
  priceRange: '{a} tot {b}',
  priceMinMax: 'Min. {a} · Max. {b}',
  priceNowIs: 'Nu: {l}',
  priceLowest: 'Laagste',
  priceAverage: 'Gemiddeld',
  priceHighest: 'Hoogste',
  priceNextHours: 'Komende {n} uur',
  priceInclGrid: 'Incl. netkosten',
  priceInclGridEst: 'Incl. netkosten (geschat)',
  priceInclBands: 'Incl. tijdblokken',
  priceNoGrid: 'Zonder netkosten',
  priceLoading: 'Prijzen laden…',
  priceLoadingGrid: 'Tarief van {c} laden…',
  widgetNone: 'Kies een widget in Indeling',
  widgetSaveToSee: 'Zichtbaar na opslaan',
  inMinutes: 'Over {n} min',
  inHours: 'Over {n} uur',
  inHoursMinutes: 'Over {h} uur {m} min',
  inDays: 'Over {n} dagen',
  happeningNow: 'Nu',
  untilTime: 'tot {t}',
  next: 'Volgende',
  noEvents: 'Geen afspraken',
  noUpcoming: 'Niets in de agenda',
  feelsLike: 'Voelt als',
  hiShort: 'Max.',
  loShort: 'Min.',
  humidity: 'Vochtigheid',
  wind: 'Wind',
  sunrise: 'Zonsopkomst',
  sunset: 'Zonsondergang',
  precip: 'Regen',
  indoor: 'Binnen',
  uv: 'UV',
  pressure: 'Luchtdruk',
  news: 'Nieuws',
  todo: 'Taken',
  offline: 'Offline',
  photoBy: 'Foto: {a}',
  week: 'Week',
  todayEvents: 'Vandaag',
  upcoming: 'Komende dagen',
  loading: 'Laden…',
  countdowns: 'Aftellen',
  cdDays: 'Nog {n} dagen',
  cdTomorrow: 'Morgen!',
  cdToday: 'Vandaag!',
  screenNotFound: 'Scherm niet gevonden',
  screenNotChosen: 'Open de link van een scherm',
  identifyScreen: 'Scherm',
  identifyDevice: 'Apparaat',
  carouselShowing: '{name} · nu: {screen}',
  doorbell: 'Deur',
  doorbellRinging: 'Er staat iemand voor de deur',
  doorbellNoPicture: 'Camera niet beschikbaar',
  until: 'tot {t}',
  nightOn: 'Nachtmodus',
  // kids layouts (web/display/widgets/kids.ts)
  kidsMorning: 'Ochtend',
  kidsAfternoon: 'Middag',
  kidsEvening: 'Avond',
  kidsAnytime: 'Door de dag',
  kidsAllDone: 'Alles klaar!',
  kidsScan: 'Vink je routines af op je telefoon',
  kidsNone: 'Vandaag geen routines',
  kidsNoMembers: 'Voeg je gezin toe in het beheer, onder Gezin',
  kidsRoutines: 'Routines',
  kidsMealsToday: 'Maaltijden vandaag',
  kidsMealsWeek: 'Weekmenu',
  kidsMealsOff: 'Zet maaltijden aan in het beheer, onder Maaltijden',
  meal_breakfast: 'Ontbijt',
  meal_lunch: 'Lunch',
  meal_snack: 'Tussendoortje',
  meal_dinner: 'Avondeten',
  greetMorning: 'Goedemorgen',
  greetAfternoon: 'Goedemiddag',
  greetEvening: 'Goedenavond',
  kidsEventsLeft: 'Nog {n} afspraken vandaag',
  kidsEventsLeft1: 'Nog 1 afspraak vandaag',
  kidsNoEventsLeft: 'Verder niets vandaag',
  kidsRoutinesDone: '{done} van {total} routines klaar',
  kidsRewards: 'Beloningen',
  kidsStarsLeft: 'Nog {n} ⭐',
  kidsStarsLeft1: 'Nog 1 ⭐',
  kidsLeft: 'Nog {n} te doen',
  kidsRewardReady: 'Klaar om in te wisselen!',
  kidsTasks: 'Taken',
  kidsNoMeal: '·',
  kidsNoMealsDay: 'Geen maaltijden vandaag',
  kidsPrivate: 'Routines komen terug als de privémodus voorbij is',
};

const da: Dict = {
  // layouts with their own view (web/display/widgets/views.ts)
  upNext: 'Næste',
  nothingMoreToday: 'Ikke mere i dag',
  firstTomorrow: 'I morgen',
  everyone: 'Alle',
  birthdays: 'Fødselsdage',
  agenda: 'Program',
  allDone: 'Alt klaret',
  noPeople: 'Vælg hver persons kalendere under Layout',
  nothingPlanned: 'Intet planlagt',
  daysWord: 'dage',
  today: 'I dag',
  tomorrow: 'I morgen',
  yesterday: 'I går',
  now: 'Nu',
  allDay: 'Hele dagen',
  more: '+{n} mere',
  dayXofY: 'Dag {x} af {y}',
  checkIn: 'Indtjekning',
  checkOut: 'Udtjekning',
  privateMode: 'Privat tilstand',
  widgetStale: 'ikke opdateret',
  priceTitle: 'Elpris',
  priceCheap: 'Billig',
  priceMid: 'Normal',
  priceHigh: 'Dyr',
  priceNextHour: 'Næste time {p}',
  priceCheapestHours: 'Billigste timer',
  priceCheapestStretches: 'Billigste perioder på {n} t',
  priceNoneLeft: 'Ingen perioder tilbage',
  priceRange: '{a} til {b}',
  priceMinMax: 'Min. {a} · Maks. {b}',
  priceNowIs: 'Nu: {l}',
  priceLowest: 'Laveste',
  priceAverage: 'Gennemsnit',
  priceHighest: 'Højeste',
  priceNextHours: 'Næste {n} t',
  priceInclGrid: 'Inkl. nettarif',
  priceInclGridEst: 'Inkl. nettarif (anslået)',
  priceInclBands: 'Inkl. tidsperioder',
  priceNoGrid: 'Uden nettarif',
  priceLoading: 'Indlæser priser…',
  priceLoadingGrid: 'Indlæser nettarif for {c}…',
  widgetNone: 'Vælg en widget under Layout',
  widgetSaveToSee: 'Vises, når du har gemt',
  inMinutes: 'Om {n} min',
  inHours: 'Om {n} t',
  inHoursMinutes: 'Om {h} t {m} min',
  inDays: 'Om {n} dage',
  happeningNow: 'Nu',
  untilTime: 'til kl. {t}',
  next: 'Næste',
  noEvents: 'Ingen begivenheder',
  noUpcoming: 'Intet planlagt',
  feelsLike: 'Føles som',
  hiShort: 'Maks.',
  loShort: 'Min.',
  humidity: 'Luftfugtighed',
  wind: 'Vind',
  sunrise: 'Solopgang',
  sunset: 'Solnedgang',
  precip: 'Nedbør',
  indoor: 'Inde',
  uv: 'UV',
  pressure: 'Lufttryk',
  news: 'Nyheder',
  todo: 'Opgaver',
  offline: 'Offline',
  photoBy: 'Foto: {a}',
  week: 'Uge',
  todayEvents: 'I dag',
  upcoming: 'Kommende',
  loading: 'Indlæser…',
  countdowns: 'Nedtællinger',
  cdDays: 'Om {n} dage',
  cdTomorrow: 'I morgen!',
  cdToday: 'I dag!',
  screenNotFound: 'Skærmen blev ikke fundet',
  screenNotChosen: 'Åbn linket til en skærm',
  identifyScreen: 'Skærm',
  identifyDevice: 'Enhed',
  carouselShowing: '{name} · nu: {screen}',
  doorbell: 'Dør',
  doorbellRinging: 'Der er nogen ved døren',
  doorbellNoPicture: 'Intet kamerabillede',
  until: 'til kl. {t}',
  nightOn: 'Nattilstand',
  // kids layouts (web/display/widgets/kids.ts)
  kidsMorning: 'Morgen',
  kidsAfternoon: 'Eftermiddag',
  kidsEvening: 'Aften',
  kidsAnytime: 'I løbet af dagen',
  kidsAllDone: 'Alt klaret!',
  kidsScan: 'Kryds rutiner af fra din telefon',
  kidsNone: 'Ingen rutiner i dag',
  kidsNoMembers: 'Tilføj din familie i adminpanelet under Familie',
  kidsRoutines: 'Rutiner',
  kidsMealsToday: 'Dagens måltider',
  kidsMealsWeek: 'Ugens måltider',
  kidsMealsOff: 'Slå måltider til i adminpanelet under Madplan',
  meal_breakfast: 'Morgenmad',
  meal_lunch: 'Frokost',
  meal_snack: 'Mellemmåltid',
  meal_dinner: 'Aftensmad',
  greetMorning: 'Godmorgen',
  greetAfternoon: 'God eftermiddag',
  greetEvening: 'Godaften',
  kidsEventsLeft: '{n} begivenheder tilbage i dag',
  kidsEventsLeft1: '1 begivenhed tilbage i dag',
  kidsNoEventsLeft: 'Ikke mere i dag',
  kidsRoutinesDone: '{done} af {total} rutiner klaret',
  kidsRewards: 'Belønninger',
  kidsStarsLeft: 'Mangler {n} ⭐',
  kidsStarsLeft1: 'Mangler 1 ⭐',
  kidsLeft: '{n} tilbage',
  kidsRewardReady: 'Klar til at blive indløst!',
  kidsTasks: 'Opgaver',
  kidsNoMeal: '·',
  kidsNoMealsDay: 'Ingen måltider planlagt i dag',
  kidsPrivate: 'Rutinerne vender tilbage, når privat tilstand slutter',
};

export const DICTS: Record<Lang, Dict> = { es, en, pt, nl, da };

export function normLang(l: string | undefined | null): Lang {
  return LANGS.includes(l as Lang) ? (l as Lang) : 'en';
}

export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  // A key missing in a language falls back to English, then to Spanish (the source).
  const s = DICTS[lang]?.[key] ?? DICTS.en[key] ?? DICTS.es[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function makeT(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
}

// ---------------------------------------------------------------------------
// Date helpers. "Date keys" are calendar dates as "YYYY-MM-DD" strings, independent
// of the browser's own timezone. All arithmetic on keys is done in UTC.
// ---------------------------------------------------------------------------

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', weekday: 'short',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23', weekday: 'short',
      });
    }
    partsCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
  /** 0 = Sunday */ weekday: number;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of a Date in a timezone. */
export function zonedParts(d: Date, tz: string): ZonedParts {
  const p: Record<string, string> = {};
  for (const x of partsFmt(tz).formatToParts(d)) p[x.type] = x.value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: WD[p.weekday] ?? 0,
  };
}

export const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

export function keyOf(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Calendar date key (YYYY-MM-DD) of an instant in a timezone. */
export function dateKeyInTz(d: Date, tz: string): string {
  const p = zonedParts(d, tz);
  return keyOf(p.year, p.month, p.day);
}

export function keyToUTC(key: string): Date {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcToKey(d: Date): string {
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key: string, n: number): string {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((keyToUTC(b).getTime() - keyToUTC(a).getTime()) / 86400000);
}

/** 0 = Sunday */
export function weekdayOfKey(key: string): number {
  return keyToUTC(key).getUTCDay();
}

/** Start of the week containing `key`. weekStart 1 = Monday. */
export function startOfWeek(key: string, weekStart = 1): string {
  const wd = weekdayOfKey(key);
  const delta = (wd - weekStart + 7) % 7;
  return addDays(key, -delta);
}

/**
 * First day of the month / week grid that shows `today`: the start of its week (weekStart, 0 = Sunday) or, with
 * startOn 'today', today itself (no past days; the rows run on 7 days at a time from there).
 */
export function gridStartOf(today: string, weekStart = 1, startOn: 'week' | 'today' = 'week'): string {
  return startOn === 'today' ? today : startOfWeek(today, weekStart);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(lang: Lang, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = lang + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALES[lang], opts);
    fmtCache.set(k, f);
  }
  return f;
}

/** Weekday name for a date key. style: 'long' | 'short' | 'narrow'. */
export function weekdayName(lang: Lang, key: string, style: 'long' | 'short' | 'narrow' = 'short'): string {
  let s = fmt(lang, { weekday: style, timeZone: 'UTC' }).format(keyToUTC(key));
  s = s.replace(/\.$/, '');
  // some locales (pt-PT) return full names for "short" ("segunda"); keep labels compact
  if (style === 'short' && s.length > 4) s = s.replace(/-feira$/, '').slice(0, 3);
  return capitalize(s);
}

/** Weekday names ordered from weekStart (0=Sunday). */
export function weekdayNames(lang: Lang, weekStart = 1, style: 'long' | 'short' | 'narrow' = 'short'): string[] {
  // 2023-01-01 was a Sunday
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(weekdayName(lang, addDays('2023-01-01', (weekStart + i) % 7), style));
  return out;
}

export function monthName(lang: Lang, month1: number, style: 'long' | 'short' = 'long'): string {
  let s = fmt(lang, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, month1 - 1, 1)));
  s = s.replace(/\.$/, '');
  return capitalize(s);
}

/** Localized long date line, e.g. es weekday_d_month → "viernes, 9 de octubre". */
/** Tokens of the custom date pattern, longest first so {dddd} wins over {ddd} and {d}. */
export const DATE_TOKENS = ['dddd', 'ddd', 'dd', 'd', 'mmmm', 'mmm', 'mm', 'm', 'yyyy', 'yy'] as const;

/** Custom date line: {dddd} Saturday, {ddd} Sat, {d} 7, {dd} 07, {mmmm} March, {mmm} Mar, {m} 3, {mm} 03, {yyyy} 2026, {yy} 26. */
export function formatDatePattern(lang: Lang, key: string, pattern: string): string {
  const d = keyToUTC(key);
  const val: Record<string, () => string> = {
    dddd: () => capitalize(fmt(lang, { weekday: 'long', timeZone: 'UTC' }).format(d)),
    ddd: () => capitalize(fmt(lang, { weekday: 'short', timeZone: 'UTC' }).format(d).replace(/\.$/, '')),
    d: () => String(d.getUTCDate()),
    dd: () => key.slice(8, 10),
    mmmm: () => { const m = fmt(lang, { month: 'long', timeZone: 'UTC' }).format(d); return lang === 'en' ? capitalize(m) : m; },
    mmm: () => { const m = fmt(lang, { month: 'short', timeZone: 'UTC' }).format(d).replace(/\.$/, ''); return lang === 'en' ? capitalize(m) : m; },
    m: () => String(d.getUTCMonth() + 1),
    mm: () => key.slice(5, 7),
    yyyy: () => key.slice(0, 4),
    yy: () => key.slice(2, 4),
  };
  return pattern.replace(/\{(dddd|ddd|dd|d|mmmm|mmm|mm|m|yyyy|yy)\}/gi, (_, t: string) => val[t.toLowerCase()]());
}

export function formatDateLine(lang: Lang, key: string, format: DateFormat = 'weekday_d_month', custom = ''): string {
  if (format === 'custom' && custom.trim()) return formatDatePattern(lang, key, custom.trim());
  const d = keyToUTC(key);
  const wd = fmt(lang, { weekday: 'long', timeZone: 'UTC' }).format(d);
  const mo = fmt(lang, { month: 'long', timeZone: 'UTC' }).format(d);
  const day = d.getUTCDate();
  const W = capitalize(wd);
  switch (format) {
    case 'weekday_month_d':
      return lang === 'en' ? `${W}, ${capitalize(mo)} ${day}` : `${W}, ${mo} ${day}`;
    case 'weekday_d_dot_month':
      return `${W} ${day}. ${lang === 'en' ? capitalize(mo) : mo}`;
    case 'weekday_month_d_y':
      return `${W}, ${lang === 'en' ? capitalize(mo) : mo} ${day}, ${d.getUTCFullYear()}`;
    case 'weekday_mdy':
      return `${W}, ${key.slice(5, 7)}/${key.slice(8, 10)}/${key.slice(0, 4)}`;
    case 'weekday_dmy':
      return `${W}, ${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
    case 'weekday_iso':
      return `${W}, ${key.slice(0, 10)}`;
    case 'weekday_d_month':
    default:
      if (lang === 'en') return `${W}, ${day} ${capitalize(mo)}`;
      if (lang === 'nl') return `${W} ${day} ${mo}`; // "Maandag 13 oktober"
      if (lang === 'da') return `${W} den ${day}. ${mo}`; // "Mandag den 13. oktober"
      return `${W}, ${day} de ${mo}`;
  }
}

/** Short day label e.g. "Hoy", "Mañana", "Sáb 11". */
export function relativeDayLabel(lang: Lang, key: string, todayKey: string, withNumber = true): string {
  const dd = diffDays(todayKey, key);
  if (dd === 0) return t(lang, 'today');
  if (dd === 1) return t(lang, 'tomorrow');
  if (dd === -1) return t(lang, 'yesterday');
  const wd = weekdayName(lang, key, 'short');
  return withNumber ? `${wd} ${keyToUTC(key).getUTCDate()}` : wd;
}

/** Format HH:MM in a timezone. */
export function formatTime(d: Date, tz: string, format24 = true, showAmPm = false): string {
  const p = zonedParts(d, tz);
  return formatHM(p.hour, p.minute, format24, showAmPm);
}

export function formatHM(h: number, m: number, format24 = true, showAmPm = false): string {
  if (format24) return `${pad2(h)}:${pad2(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)}${showAmPm ? (h < 12 ? ' AM' : ' PM') : ''}`;
}

/** "En 2 h", "En 25 min", "En 3 días". */
export function formatCountdown(lang: Lang, ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return t(lang, 'now');
  if (min < 60) return t(lang, 'inMinutes', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m >= 5 && h < 3 ? t(lang, 'inHoursMinutes', { h, m }) : t(lang, 'inHours', { n: h + (m >= 30 ? 1 : 0) });
  const days = Math.round(h / 24);
  return days <= 1 ? t(lang, 'tomorrow') : t(lang, 'inDays', { n: days });
}
