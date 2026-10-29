// Baraja tradicional de la Lotería mexicana: 54 cartas.
// Los nombres y los versos (dichos del gritón) son de tradición popular.
// El arte por defecto es original: un emoji o un pequeño SVG propio por carta.
// Cualquier carta se puede renombrar o sustituir por una imagen desde el editor.

const T = [
  [1, 'El Gallo', '🐓', 'El que le cantó a San Pedro no le volverá a cantar.'],
  [2, 'El Diablito', '😈', 'Pórtate bien, cuatito, si no te lleva el coloradito.'],
  [3, 'La Dama', '💃', 'Puliendo el paso por toda la calle real.'],
  [4, 'El Catrín', '🎩', 'Don Ferruco en la alameda, su bastón quería tirar.'],
  [5, 'El Paraguas', '☂️', 'Para el sol y para el agua.'],
  [6, 'La Sirena', '🧜‍♀️', 'Con los cantos de sirena no te vayas a marear.'],
  [7, 'La Escalera', '🪜', 'Súbeme paso a pasito, no quieras pegar brinquitos.'],
  [8, 'La Botella', '🍾', 'La herramienta del borracho.'],
  [9, 'El Barril', '🛢️', 'Tanto bebió el albañil, que quedó como barril.'],
  [10, 'El Árbol', '🌳', 'El que a buen árbol se arrima, buena sombra le cobija.'],
  [11, 'El Melón', '🍈', 'Me lo das o me lo quitas.'],
  [12, 'El Valiente', '🗡️', '¿Por qué le corres, cobarde, trayendo tan buen puñal?'],
  [13, 'El Gorrito', '👒', 'Ponle su gorrito al nene, no se nos vaya a resfriar.'],
  [14, 'La Muerte', '⚰️', 'La muerte tilica y flaca.'],
  [15, 'La Pera', '🍐', 'El que espera, desespera.'],
  [16, 'La Bandera', 'svg:bandera', 'Verde, blanco y colorado, la bandera del soldado.'],
  [17, 'El Bandolón', '🪕', 'Tocando su bandolón está el mariachi Simón.'],
  [18, 'El Violoncello', '🎻', 'Creciendo se fue hasta el cielo, y como no fue violín, tuvo que ser violoncello.'],
  [19, 'La Garza', '🦩', 'Al otro lado del río tengo mi banco de arena.'],
  [20, 'El Pájaro', '🐦', 'Tú me traes a puros brincos, como pájaro en la rama.'],
  [21, 'La Mano', '✋', 'La mano de un criminal.'],
  [22, 'La Bota', '👢', 'Una bota igual que la otra.'],
  [23, 'La Luna', '🌙', 'El farol de los enamorados.'],
  [24, 'El Cotorro', '🦜', 'Cotorro, cotorro, saca la pata y empiézame a platicar.'],
  [25, 'El Borracho', '🥴', '¡Ah, qué borracho tan necio, ya no lo puedo aguantar!'],
  [26, 'El Negrito', '🍬', 'El que se comió el azúcar.'],
  [27, 'El Corazón', '❤️', 'No me extrañes, corazón, que regreso en el camión.'],
  [28, 'La Sandía', '🍉', 'La barriga que Juan tenía era empacho de sandía.'],
  [29, 'El Tambor', '🥁', 'No te arrugues, cuero viejo, que te quiero pa\' tambor.'],
  [30, 'El Camarón', '🦐', 'Camarón que se duerme, se lo lleva la corriente.'],
  [31, 'Las Jaras', '🏹', 'Las jaras de Adán: donde pegan, dan.'],
  [32, 'El Músico', '🎺', 'El músico trompas de hule ya no me quiere tocar.'],
  [33, 'La Araña', '🕷️', 'Atarántamela a palos, no me la dejes llegar.'],
  [34, 'El Soldado', '🪖', 'Uno, dos y tres, el soldado p\'al cuartel.'],
  [35, 'La Estrella', '⭐', 'La guía de los marineros.'],
  [36, 'El Cazo', '🥘', 'El caso que te hago es poco.'],
  [37, 'El Mundo', '🌎', 'Este mundo es una bola, y nosotros un bolón.'],
  [38, 'El Apache', '🪶', '¡Ah, Chihuahua! Cuánto apache con pantalón y huarache.'],
  [39, 'El Nopal', '🌵', 'Al nopal lo van a ver nomás cuando tiene tunas.'],
  [40, 'El Alacrán', '🦂', 'El que con la cola pica, le dan una paliza.'],
  [41, 'La Rosa', '🌹', 'Rosita, Rosaura, ven que te quiero ahora.'],
  [42, 'La Calavera', '💀', 'Al pasar por el panteón me encontré un calaverón.'],
  [43, 'La Campana', '🔔', 'Tú con la campana y yo con tu hermana.'],
  [44, 'El Cantarito', '🏺', 'Tanto va el cántaro al agua, que se quiebra y te moja las enaguas.'],
  [45, 'El Venado', '🦌', 'Saltando va buscando, pero no ve nada el venado.'],
  [46, 'El Sol', '☀️', 'La cobija de los pobres.'],
  [47, 'La Corona', '👑', 'El sombrero de los reyes.'],
  [48, 'La Chalupa', '🛶', 'Rema que rema Lupita, sentada en su chalupita.'],
  [49, 'El Pino', '🌲', 'Fresco y oloroso, en todo tiempo hermoso.'],
  [50, 'El Pescado', '🐟', 'El que por la boca muere, aunque mudo fuere.'],
  [51, 'La Palma', '🌴', 'Palmero, sube a la palma y bájame un coco real.'],
  [52, 'La Maceta', '🪴', 'El que nace pa\' maceta no sale del corredor.'],
  [53, 'El Arpa', 'svg:arpa', 'Arpa vieja de mi suegra, ya no sirves pa\' tocar.'],
  [54, 'La Rana', '🐸', 'Al ver a la verde rana, qué brinco pegó tu hermana.'],
];

export const CARTAS_TRADICIONALES = T.map(([n, nombre, arte, verso]) => ({
  id: 'c' + n,
  nombre,
  verso,
  arte,
}));

// Paleta festiva para el fondo del arte de cada carta.
export const COLORES = ['#E4007C', '#F5A300', '#00915A', '#1F5BB5', '#F2611D', '#7A2E8F', '#0096A0', '#D11F3C'];

export function colorDe(carta, indice) {
  if (carta.color) return carta.color;
  return COLORES[indice % COLORES.length];
}

export const REVERSO_DEF = {
  texto: 'LOTERÍA',
  color1: '#7A1450',
  color2: '#1F5BB5',
  img: false,
};

export const ENCABEZADO_DEF = {
  texto: 'LOTERÍA',
  subtitulo: '',
  color: '#E4007C',
  img: false,
};

export function barajaPorDefecto() {
  return {
    nombre: 'Lotería tradicional',
    cartas: CARTAS_TRADICIONALES.map((c) => ({ ...c })),
    reverso: { ...REVERSO_DEF },
    encabezado: { ...ENCABEZADO_DEF },
    estiloImagen: 'arte', // 'arte' = la imagen va dentro del marco; 'completa' = la imagen ocupa toda la carta
  };
}

// Arte SVG propio para cartas sin buen emoji universal.
export const SVG_ARTE = {
  bandera: `<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="0" y="0" width="40" height="80" fill="#006847"/><rect x="40" y="0" width="40" height="80" fill="#FFFFFF"/><rect x="80" y="0" width="40" height="80" fill="#CE1126"/><circle cx="60" cy="40" r="11" fill="none" stroke="#8B5A2B" stroke-width="3"/><path d="M53 44c4-6 10-6 14 0" stroke="#3E7D3A" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="60" cy="36" r="3.4" fill="#8B5A2B"/></svg>`,
  arpa: `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 112 L22 18 Q22 6 34 8 Q62 14 74 40 Q84 62 88 92 L92 112 Z" fill="none" stroke="#B8860B" stroke-width="7" stroke-linejoin="round"/><g stroke="#F3E3B0" stroke-width="1.6"><line x1="30" y1="22" x2="30" y2="108"/><line x1="38" y1="18" x2="38" y2="108"/><line x1="46" y1="19" x2="46" y2="108"/><line x1="54" y1="23" x2="54" y2="108"/><line x1="62" y1="29" x2="62" y2="108"/><line x1="70" y1="38" x2="70" y2="108"/><line x1="78" y1="54" x2="78" y2="108"/></g><rect x="14" y="106" width="84" height="9" rx="3" fill="#8B5A2B"/></svg>`,
};
