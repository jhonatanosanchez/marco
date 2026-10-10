// Gallery on a server with a storage plan (Marco Cloud): quota bar and upload errors. Spanish key; [es, en, pt].
export const ROWS12: [string, string, string][] = [
  ['Tus fotos para el fondo de pantalla. Se guardan en tu cuenta de Marco.', 'Your photos for the screen background. They are stored in your Marco account.', 'As tuas fotos para o fundo do ecrã. Ficam guardadas na tua conta Marco.'],
  [
    'JPG, HEIC, PNG, WebP… · tu navegador las reduce, las convierte y les quita los datos de ubicación antes de subirlas',
    'JPG, HEIC, PNG, WebP… · your browser shrinks and converts them and removes location data before uploading',
    'JPG, HEIC, PNG, WebP… · o teu navegador reduz, converte e remove os dados de localização antes de enviar',
  ],
  ['Espacio de la galería', 'Gallery storage', 'Espaço da galeria'],
  ['{used} de {max} · {n} fotos', '{used} of {max} · {n} photos', '{used} de {max} · {n} fotos'],
  ['quedan {free} libres', '{free} free', 'restam {free} livres'],
  ['Queda poco espacio. Borra las fotos que ya no uses para subir más.', 'Space is running low. Delete photos you no longer use to upload more.', 'Resta pouco espaço. Apaga as fotos que já não usas para enviar mais.'],
  ['La galería está llena ({max}). Borra alguna foto para subir más.', 'The gallery is full ({max}). Delete a photo to upload more.', 'A galeria está cheia ({max}). Apaga alguma foto para enviar mais.'],
  ['Has llegado al máximo de {n} fotos. Borra alguna para subir más.', 'You have reached the maximum of {n} photos. Delete some to upload more.', 'Chegaste ao máximo de {n} fotos. Apaga algumas para enviar mais.'],
  ['No cabe: quedan {free} libres en la galería.', 'It does not fit: {free} left in the gallery.', 'Não cabe: restam {free} livres na galeria.'],
  ['Ocupa más de {size} incluso optimizada.', 'It takes more than {size} even after optimizing.', 'Ocupa mais de {size} mesmo depois de otimizada.'],
  ['Demasiadas subidas seguidas. Espera un minuto y vuelve a intentarlo.', 'Too many uploads in a row. Wait a minute and try again.', 'Demasiados envios seguidos. Espera um minuto e tenta de novo.'],
  ['{n} fotos no caben en la galería', '{n} photos do not fit in the gallery', '{n} fotos não cabem na galeria'],
];

/** Singular forms of the count strings above (t() uses them when n is 1). */
export const SINGULAR12: Record<string, [string, string, string]> = {
  '{used} de {max} · {n} fotos': ['{used} de {max} · 1 foto', '{used} of {max} · 1 photo', '{used} de {max} · 1 foto'],
  '{n} fotos no caben en la galería': ['1 foto no cabe en la galería', '1 photo does not fit in the gallery', '1 foto não cabe na galeria'],
};
