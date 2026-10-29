// Reglas de la ruleta: casillas, orden del cilindro, apuestas válidas y pagos.
// Lo usan el servidor (autoridad) y los navegadores (paño y rueda).

export const DOBLE_CERO = 37;
export const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const etiqueta = (n) => (n === DOBLE_CERO ? '00' : String(n));
export const colorDe = (n) => (n === 0 || n === DOBLE_CERO ? 'verde' : ROJOS.has(n) ? 'rojo' : 'negro');
export const esCero = (n) => n === 0 || n === DOBLE_CERO;

const ORDEN_EUROPEO = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const ORDEN_AMERICANO = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];

export const VARIANTES = {
  americana: {
    nombre: 'Ruleta americana',
    corto: 'Americana',
    orden: ORDEN_AMERICANO,
    ceros: [0, DOBLE_CERO],
    partage: false,
    anunciadas: false,
    ventaja: 'La casa tiene 5.26 % de ventaja (3 en el cinco: 7.89 %).',
    resumen: 'Cero y doble cero, 38 casillas.',
  },
  europea: {
    nombre: 'Ruleta europea',
    corto: 'Europea',
    orden: ORDEN_EUROPEO,
    ceros: [0],
    partage: false,
    anunciadas: true,
    ventaja: 'La casa tiene 2.70 % de ventaja.',
    resumen: 'Un solo cero, 37 casillas y apuestas anunciadas.',
  },
  francesa: {
    nombre: 'Ruleta francesa',
    corto: 'Francesa',
    orden: ORDEN_EUROPEO,
    ceros: [0],
    partage: true,
    anunciadas: true,
    ventaja: 'Con La Partage la ventaja baja a 1.35 % en las suertes sencillas.',
    resumen: 'Un cero y La Partage: si sale cero recuperas la mitad de tus suertes sencillas.',
  },
};

export const casillas = (v) => [...VARIANTES[v].ceros, ...Array.from({ length: 36 }, (_, i) => i + 1)];

// Fichas disponibles, en centavos de dólar ficticio.
export const FICHAS = [100, 500, 1000, 2500, 10000, 50000];
export const MAX_POR_APUESTA = 50000; // $500 por casilla
export const MAX_POR_RONDA = 500000; // $5,000 por ronda

export const NOMBRE_TIPO = {
  pleno: 'Pleno',
  caballo: 'Caballo',
  calle: 'Calle',
  cuadro: 'Cuadro',
  linea: 'Seisena',
  cinco: 'Cinco números',
  sencilla: 'Suerte sencilla',
  docena: 'Docena',
  columna: 'Columna',
};

export const claveDe = (nums) => 'n' + [...nums].sort((a, b) => a - b).join('-');

const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const EXTERIORES = [
  { clave: 'falta', tipo: 'sencilla', nombre: '1 a 18', fr: 'Manque', numeros: rango(1, 18), pago: 1 },
  { clave: 'par', tipo: 'sencilla', nombre: 'Par', fr: 'Pair', numeros: rango(1, 36).filter((n) => n % 2 === 0), pago: 1 },
  { clave: 'rojo', tipo: 'sencilla', nombre: 'Rojo', fr: 'Rouge', numeros: [...ROJOS], pago: 1 },
  { clave: 'negro', tipo: 'sencilla', nombre: 'Negro', fr: 'Noir', numeros: rango(1, 36).filter((n) => !ROJOS.has(n)), pago: 1 },
  { clave: 'impar', tipo: 'sencilla', nombre: 'Impar', fr: 'Impair', numeros: rango(1, 36).filter((n) => n % 2 === 1), pago: 1 },
  { clave: 'pasa', tipo: 'sencilla', nombre: '19 a 36', fr: 'Passe', numeros: rango(19, 36), pago: 1 },
  { clave: 'd1', tipo: 'docena', nombre: '1.ª docena', fr: 'P12', numeros: rango(1, 12), pago: 2 },
  { clave: 'd2', tipo: 'docena', nombre: '2.ª docena', fr: 'M12', numeros: rango(13, 24), pago: 2 },
  { clave: 'd3', tipo: 'docena', nombre: '3.ª docena', fr: 'D12', numeros: rango(25, 36), pago: 2 },
  { clave: 'c1', tipo: 'columna', nombre: '1.ª columna', fr: '2 à 1', numeros: rango(1, 36).filter((n) => n % 3 === 1), pago: 2 },
  { clave: 'c2', tipo: 'columna', nombre: '2.ª columna', fr: '2 à 1', numeros: rango(1, 36).filter((n) => n % 3 === 2), pago: 2 },
  { clave: 'c3', tipo: 'columna', nombre: '3.ª columna', fr: '2 à 1', numeros: rango(1, 36).filter((n) => n % 3 === 0), pago: 2 },
];

const cache = {};
// Todas las apuestas válidas de una variante: Map clave → { clave, tipo, nombre, numeros, pago }
export function apuestasValidas(v) {
  if (cache[v]) return cache[v];
  const V = VARIANTES[v];
  if (!V) throw new Error('Variante de ruleta desconocida');
  const m = new Map();
  const add = (tipo, nums, pago) => {
    const numeros = [...nums].sort((a, b) => a - b);
    const k = claveDe(numeros);
    m.set(k, { clave: k, tipo, numeros, pago, nombre: `${NOMBRE_TIPO[tipo]} ${nums.map(etiqueta).join('-')}` });
  };
  for (const n of casillas(v)) add('pleno', [n], 35);
  for (let r = 0; r < 12; r++) {
    const a = 3 * r + 1;
    add('caballo', [a, a + 1], 17);
    add('caballo', [a + 1, a + 2], 17);
    add('calle', [a, a + 1, a + 2], 11);
  }
  for (let n = 1; n <= 33; n++) add('caballo', [n, n + 3], 17);
  for (let r = 0; r < 11; r++) {
    const a = 3 * r + 1;
    add('cuadro', [a, a + 1, a + 3, a + 4], 8);
    add('cuadro', [a + 1, a + 2, a + 4, a + 5], 8);
    add('linea', [a, a + 1, a + 2, a + 3, a + 4, a + 5], 5);
  }
  if (V.ceros.includes(DOBLE_CERO)) {
    for (const p of [[0, 1], [0, 2], [DOBLE_CERO, 2], [DOBLE_CERO, 3], [0, DOBLE_CERO]]) add('caballo', p, 17);
    for (const t of [[0, 1, 2], [0, DOBLE_CERO, 2], [DOBLE_CERO, 2, 3]]) add('calle', t, 11);
    add('cinco', [0, DOBLE_CERO, 1, 2, 3], 6);
  } else {
    for (const p of [[0, 1], [0, 2], [0, 3]]) add('caballo', p, 17);
    for (const t of [[0, 1, 2], [0, 2, 3]]) add('calle', t, 11);
    add('cuadro', [0, 1, 2, 3], 8);
  }
  for (const e of EXTERIORES) m.set(e.clave, { ...e, nombre: V.partage ? `${e.fr} (${e.nombre})` : e.nombre });
  cache[v] = m;
  return m;
}

// Cuánto regresa una apuesta (incluye lo apostado). 0 si pierde.
export function retorno(desc, monto, resultado, v) {
  if (desc.numeros.includes(resultado)) return monto * (desc.pago + 1);
  if (VARIANTES[v].partage && resultado === 0 && desc.tipo === 'sencilla') return Math.floor(monto / 2);
  return 0;
}

// ---------- Apuestas anunciadas (cilindro) ----------
const k = (s) => claveDe(s.split('-').map(Number));
export const ANUNCIADAS = {
  voisins: {
    nombre: 'Vecinos del cero',
    fr: 'Voisins du zéro',
    fichas: [['0-2-3', 2], ['4-7', 1], ['12-15', 1], ['18-21', 1], ['19-22', 1], ['25-26-28-29', 2], ['32-35', 1]],
  },
  tiers: { nombre: 'Tercio del cilindro', fr: 'Tiers du cylindre', fichas: [['5-8', 1], ['10-11', 1], ['13-16', 1], ['23-24', 1], ['27-30', 1], ['33-36', 1]] },
  orphelins: { nombre: 'Huérfanos', fr: 'Orphelins', fichas: [['1', 1], ['6-9', 1], ['14-17', 1], ['17-20', 1], ['31-34', 1]] },
  jeuzero: { nombre: 'Juego cero', fr: 'Jeu zéro', fichas: [['0-3', 1], ['12-15', 1], ['26', 1], ['32-35', 1]] },
};
export const fichasAnunciada = (nombre) => ANUNCIADAS[nombre].fichas.reduce((s, [, n]) => s + n, 0);

export function vecinos(n, v, lado = 2) {
  const orden = VARIANTES[v].orden;
  const i = orden.indexOf(n);
  if (i < 0) return [];
  const out = [];
  for (let d = -lado; d <= lado; d++) out.push(orden[(i + d + orden.length) % orden.length]);
  return out;
}

// Convierte una apuesta anunciada en apuestas sencillas del paño.
export function expandirAnunciada(nombre, ficha, v, numero) {
  if (!VARIANTES[v].anunciadas) return null;
  if (nombre === 'vecinos') {
    if (!casillas(v).includes(numero)) return null;
    return vecinos(numero, v).map((n) => ({ clave: claveDe([n]), monto: ficha }));
  }
  const a = ANUNCIADAS[nombre];
  if (!a) return null;
  return a.fichas.map(([s, n]) => ({ clave: k(s), monto: ficha * n }));
}

// Sectores para dibujar el cilindro de apuestas anunciadas.
export const SECTORES = {
  voisins: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
  jeuzero: [12, 35, 3, 26, 0, 32, 15],
  tiers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
  orphelins: [1, 20, 14, 31, 9, 17, 34, 6],
};
