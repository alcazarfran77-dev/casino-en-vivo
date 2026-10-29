// Reglas del blackjack: valor de manos, variantes y apuestas laterales.
// Las cartas son textos rango+palo: 'A' 'S' → 'AS', '10H', 'KD'.

export const PALOS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const NOMBRE_PALO = { S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' };
export const RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rangoDe = (c) => c.slice(0, -1);
export const paloDe = (c) => c.slice(-1);
export const esRoja = (c) => paloDe(c) === 'H' || paloDe(c) === 'D';
export const valorDe = (c) => {
  const r = rangoDe(c);
  if (r === 'A') return 1;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
};

export function total(cartas) {
  let t = 0;
  let ases = 0;
  for (const c of cartas) {
    t += valorDe(c);
    if (rangoDe(c) === 'A') ases++;
  }
  const blanda = ases > 0 && t + 10 <= 21;
  return { total: blanda ? t + 10 : t, blanda };
}

export const esBlackjack = (cartas, dividida = false) => !dividida && cartas.length === 2 && total(cartas).total === 21;

export function textoTotal(cartas, dividida = false) {
  if (!cartas.length) return '';
  if (esBlackjack(cartas, dividida)) return 'Blackjack';
  const { total: t, blanda } = total(cartas);
  if (t > 21) return `${t}, se pasó`;
  return blanda && t < 21 ? `${t - 10} o ${t}` : String(t);
}

export function mazos(n) {
  const z = [];
  for (let m = 0; m < n; m++) for (const p of Object.keys(PALOS)) for (const r of RANGOS) z.push(r + p);
  return z;
}

export const VARIANTES = {
  americano: {
    nombre: 'Blackjack americano',
    corto: 'Americano',
    mazos: 6,
    h17: true,
    pagoBJ: 3 / 2,
    seguro: true,
    rendicion: false,
    laterales: false,
    maxManos: 4,
    min: 500,
    max: 50000,
    reglas: ['6 barajas', 'El crupier pide con 17 blando', 'Revisa su carta oculta si muestra As o 10', 'Blackjack paga 3 a 2', 'Doblar con cualquier par de cartas, también después de dividir', 'Dividir hasta 4 manos', 'Seguro paga 2 a 1'],
  },
  premium: {
    nombre: 'Blackjack Premium',
    corto: 'Premium',
    mazos: 6,
    h17: false,
    pagoBJ: 3 / 2,
    seguro: true,
    rendicion: true,
    laterales: true,
    maxManos: 4,
    min: 500,
    max: 50000,
    reglas: ['6 barajas', 'El crupier se planta en todos los 17', 'Rendición: recuperas la mitad de la apuesta', 'Blackjack paga 3 a 2', 'Doblar y dividir hasta 4 manos', 'Pares perfectos: 6, 12 o 25 a 1', '21+3: de 5 a 100 a 1'],
  },
};

export const FICHAS = [100, 500, 1000, 2500, 10000, 50000];
export const MAX_LATERAL = 10000;

export function paresPerfectos(a, b) {
  if (rangoDe(a) !== rangoDe(b)) return null;
  if (paloDe(a) === paloDe(b)) return { tipo: 'perfecto', nombre: 'Par perfecto', pago: 25 };
  if (esRoja(a) === esRoja(b)) return { tipo: 'color', nombre: 'Par de color', pago: 12 };
  return { tipo: 'mixto', nombre: 'Par mixto', pago: 6 };
}

export function veintiunoMasTres(a, b, c) {
  const rs = [a, b, c].map(rangoDe);
  const ps = [a, b, c].map(paloDe);
  const color = ps.every((p) => p === ps[0]);
  const trio = rs.every((r) => r === rs[0]);
  const idx = rs.map((r) => RANGOS.indexOf(r) + 1).sort((x, y) => x - y);
  const seguidos = (x) => x[1] === x[0] + 1 && x[2] === x[1] + 1;
  const escalera = seguidos(idx) || (idx[0] === 1 && idx[1] === 12 && idx[2] === 13);
  if (trio && color) return { tipo: 'trio-palo', nombre: 'Trío del mismo palo', pago: 100 };
  if (escalera && color) return { tipo: 'escalera-color', nombre: 'Escalera de color', pago: 40 };
  if (trio) return { tipo: 'trio', nombre: 'Trío', pago: 30 };
  if (escalera) return { tipo: 'escalera', nombre: 'Escalera', pago: 10 };
  if (color) return { tipo: 'color', nombre: 'Color', pago: 5 };
  return null;
}

export function crupierPide(cartas, h17) {
  const { total: t, blanda } = total(cartas);
  return t < 17 || (h17 && t === 17 && blanda);
}

// Estrategia básica simplificada para el botón de consejo.
export function consejo(mano, cartaCrupier, puede) {
  const d = valorDe(cartaCrupier) === 1 ? 11 : valorDe(cartaCrupier);
  const { total: t, blanda } = total(mano.cartas);
  const par = mano.cartas.length === 2 && valorDe(mano.cartas[0]) === valorDe(mano.cartas[1]);
  if (par && puede.dividir) {
    const v = valorDe(mano.cartas[0]);
    if (v === 1 || v === 8) return 'dividir';
    if ((v === 2 || v === 3 || v === 7) && d <= 7) return 'dividir';
    if (v === 6 && d <= 6) return 'dividir';
    if (v === 9 && d !== 7 && d < 10) return 'dividir';
    if (v === 4 && (d === 5 || d === 6)) return 'dividir';
  }
  if (puede.rendirse && !blanda && ((t === 16 && d >= 9) || (t === 15 && d === 10))) return 'rendirse';
  if (blanda) {
    if (t >= 19) return 'plantarse';
    if (t === 18) return d <= 6 && puede.doblar && d >= 3 ? 'doblar' : d <= 8 ? 'plantarse' : 'pedir';
    if (puede.doblar && ((t >= 15 && d >= 4 && d <= 6) || (t >= 13 && d >= 5 && d <= 6))) return 'doblar';
    return 'pedir';
  }
  if (t >= 17) return 'plantarse';
  if (t >= 13) return d <= 6 ? 'plantarse' : 'pedir';
  if (t === 12) return d >= 4 && d <= 6 ? 'plantarse' : 'pedir';
  if (t === 11) return puede.doblar ? 'doblar' : 'pedir';
  if (t === 10) return puede.doblar && d <= 9 ? 'doblar' : 'pedir';
  if (t === 9) return puede.doblar && d >= 3 && d <= 6 ? 'doblar' : 'pedir';
  return 'pedir';
}
