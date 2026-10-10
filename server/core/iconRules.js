// Default icon rules, shared by the server (server/core/defaults.js), the admin and the display
// (web/shared/emoji.ts): keywords in English, Spanish and Portuguese, matched against event titles and descriptions.
// More specific categories come first. A plain module (not JSON) so it imports the same way on Node, Vite and Workers.
export default [
  {
    id: 'r_birthday', emoji: '🎂',
    match: [
      'cumple', 'cumpleaños', 'birthday', 'bday', 'b-day', 'aniversário', 'aniversario', 'faz anos',
    ],
  },
  {
    id: 'r_checkout', emoji: '🧳',
    match: [
      'check-out', 'checkout', 'check out', 'departure', 'salida huésped', 'saída',
    ],
  },
  {
    id: 'r_airbnb', emoji: '🏠',
    match: [
      'airbnb', 'booking', 'vrbo', 'reserva', 'reservation', 'reserved', 'check-in', 'checkin', 'guest', 'guests',
      'hóspede', 'huésped',
    ],
  },
  {
    id: 'r_flight', emoji: '✈️',
    match: [
      'vuelo', 'flight', 'fly to', 'voo', 'aeropuerto', 'airport', 'aeroporto', 'boarding', 'embarque',
    ],
  },
  {
    id: 'r_train', emoji: '🚆',
    match: [
      'train', 'tren', 'comboio', 'railway', 'estación de tren',
    ],
  },
  {
    id: 'r_doctor', emoji: '🩺',
    match: [
      'médico', 'medico', 'doctor', 'dr.', 'gp', 'dentista', 'dentist', 'orthodontist', 'ortodoncista',
      'pediatrician', 'pediatra', 'consulta', 'appointment', 'checkup', 'check-up', 'hospital', 'clinic', 'clínica',
      'physio', 'fisio', 'therapy', 'terapia', 'vaccine', 'vacuna', 'vacina', 'optician', 'óptica',
    ],
  },
  {
    id: 'r_pharmacy', emoji: '💊',
    match: [
      'pharmacy', 'farmacia', 'farmácia', 'prescription', 'receta', 'medication', 'medicine', 'medicación',
      'medicação',
    ],
  },
  {
    id: 'r_school', emoji: '🎒',
    match: [
      'colegio', 'escuela', 'school', 'escola', 'kindergarten', 'nursery', 'daycare', 'guardería', 'creche',
      'parents evening', 'tutoría', 'reunião de pais', 'field trip', 'excursión',
    ],
  },
  {
    id: 'r_exam', emoji: '📝',
    match: [
      'exam', 'examen', 'exame', 'quiz', 'homework', 'deberes', 'trabalho de casa', 'assignment',
    ],
  },
  {
    id: 'r_swim', emoji: '🏊',
    match: [
      'swim', 'swimming', 'natación', 'natação', 'piscina', 'pool',
    ],
  },
  {
    id: 'r_sport', emoji: '🏃',
    match: [
      'fútbol', 'futbol', 'futebol', 'football', 'soccer', 'basketball', 'baloncesto', 'basquetebol', 'gym',
      'workout', 'training', 'entreno', 'entrenamiento', 'treino', 'ginásio', 'gimnasio', 'padel', 'pádel', 'tenis',
      'ténis', 'tennis', 'deporte', 'desporto', 'sport', 'sports', 'match', 'partido', 'jogo', 'running', 'run',
      'yoga', 'pilates', 'dance', 'baile', 'dança', 'karate', 'judo', 'cycling', 'ciclismo', 'hiking', 'senderismo',
    ],
  },
  {
    id: 'r_haircut', emoji: '💇',
    match: [
      'haircut', 'hairdresser', 'barber', 'salon', 'peluquería', 'peluqueria', 'cabeleireiro', 'barbería',
      'barbearia',
    ],
  },
  {
    id: 'r_coffee', emoji: '☕',
    match: [
      'coffee', 'café', 'brunch', 'breakfast', 'desayuno', 'pequeno-almoço', 'merienda', 'lanche',
    ],
  },
  {
    id: 'r_dinner', emoji: '🍽️',
    match: [
      'cena', 'cenar', 'dinner', 'jantar', 'restaurante', 'restaurant', 'almuerzo', 'almoço', 'lunch', 'comida',
      'bbq', 'barbecue', 'barbacoa', 'churrasco',
    ],
  },
  {
    id: 'r_drinks', emoji: '🍻',
    match: [
      'drinks', 'beers', 'pub', 'bar', 'cañas', 'copas', 'happy hour',
    ],
  },
  {
    id: 'r_party', emoji: '🥳',
    match: [
      'party', 'fiesta', 'festa', 'celebration', 'celebración', 'celebração', 'sleepover', 'playdate',
      'christening', 'bautizo', 'batizado', 'communion', 'comunión', 'comunhão',
    ],
  },
  {
    id: 'r_meeting', emoji: '💼',
    match: [
      'reunión', 'reunion', 'meeting', 'call', 'reunião', 'zoom', 'teams', 'google meet', 'interview', 'entrevista',
      'conference', 'conferencia', 'conferência', 'presentation', 'presentación', 'apresentação',
    ],
  },
  {
    id: 'r_work', emoji: '💻',
    match: [
      'work', 'trabajo', 'trabalho', 'office', 'oficina', 'escritório', 'shift', 'turno', 'on call', 'guardia',
    ],
  },
  {
    id: 'r_holiday', emoji: '🎉',
    match: [
      'festivo', 'feriado', 'public holiday', 'bank holiday', 'national holiday',
    ],
  },
  {
    id: 'r_vacation', emoji: '🏖️',
    match: [
      'vacaciones', 'holiday', 'holidays', 'férias', 'vacation', 'trip', 'viaje', 'viagem', 'getaway', 'escapada',
      'beach', 'playa', 'praia', 'camping', 'acampada', 'campismo',
    ],
  },
  {
    id: 'r_wedding', emoji: '💍',
    match: [
      'boda', 'wedding', 'casamento', 'engagement', 'pedida', 'noivado',
    ],
  },
  {
    id: 'r_shopping', emoji: '🛒',
    match: [
      'compra', 'compras', 'shopping', 'groceries', 'grocery', 'mercado', 'supermercado', 'supermarket', 'market',
    ],
  },
  {
    id: 'r_delivery', emoji: '📦',
    match: [
      'delivery', 'package', 'parcel', 'entrega', 'paquete', 'encomenda', 'pick up parcel', 'recogida',
    ],
  },
  {
    id: 'r_car', emoji: '🚗',
    match: [
      'coche', 'car', 'taller', 'garage', 'mechanic', 'mecánico', 'mecânico', 'itv', 'mot', 'inspeção',
      'inspección', 'inspection', 'oficina auto', 'carro', 'car wash', 'lavado', 'tyres', 'neumáticos', 'pneus',
    ],
  },
  {
    id: 'r_repair', emoji: '🔧',
    match: [
      'plumber', 'fontanero', 'canalizador', 'electrician', 'electricista', 'eletricista', 'repair', 'reparación',
      'reparação', 'technician', 'técnico', 'maintenance', 'mantenimiento', 'manutenção', 'installer',
      'instalación',
    ],
  },
  {
    id: 'r_cleaning', emoji: '🧹',
    match: [
      'cleaning', 'cleaner', 'limpieza', 'limpeza', 'housekeeping', 'laundry', 'colada', 'lavandería', 'lavandaria',
    ],
  },
  {
    id: 'r_trash', emoji: '🗑️',
    match: [
      'trash', 'garbage', 'rubbish', 'bins', 'bin day', 'recycling', 'basura', 'reciclaje', 'lixo', 'reciclagem',
    ],
  },
  {
    id: 'r_garden', emoji: '🌱',
    match: [
      'garden', 'gardening', 'jardín', 'jardim', 'jardinería', 'jardinagem', 'plants', 'plantas', 'lawn',
    ],
  },
  {
    id: 'r_bill', emoji: '💶',
    match: [
      'pago', 'factura', 'fatura', 'bill', 'invoice', 'payment', 'pay', 'rent', 'alquiler', 'renda', 'mortgage',
      'hipoteca', 'recibo', 'pagamento', 'taxes', 'impuestos', 'impostos', 'insurance', 'seguro',
    ],
  },
  {
    id: 'r_deadline', emoji: '⏰',
    match: [
      'deadline', 'due', 'plazo', 'prazo', 'vencimiento', 'vencimento', 'expires', 'caduca', 'renewal',
      'renovación', 'renovação',
    ],
  },
  {
    id: 'r_vet', emoji: '🐾',
    match: [
      'veterinario', 'veterinário', 'vet', 'veterinary', 'grooming', 'peluquería canina', 'dog', 'perro', 'cão',
      'puppy', 'cachorro',
    ],
  },
  {
    id: 'r_music', emoji: '🎹',
    match: [
      'piano', 'guitar', 'guitarra', 'violin', 'violín', 'violino', 'music lesson', 'clase de música',
      'aula de música', 'choir', 'coro', 'band practice', 'ensayo', 'ensaio',
    ],
  },
  {
    id: 'r_cinema', emoji: '🎬',
    match: [
      'cine', 'cinema', 'movie', 'movies', 'film', 'filme', 'película', 'theatre', 'theater', 'teatro', 'show',
      'espectáculo', 'espetáculo',
    ],
  },
  {
    id: 'r_concert', emoji: '🎵',
    match: [
      'concierto', 'concert', 'concerto', 'festival', 'gig', 'live music',
    ],
  },
  {
    id: 'r_babysitter', emoji: '🧸',
    match: [
      'babysitter', 'babysitting', 'nanny', 'niñera', 'canguro', 'ama', 'baby-sitter',
    ],
  },
];
