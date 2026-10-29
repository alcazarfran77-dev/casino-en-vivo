// Reglas del videobingo: 4 cartones de 3×5 que reparten los 60 números,
// 30 bolas, premios por figura y bolas extra con precio según su valor esperado.

export const NUMEROS = 60;
export const SORTEO = 30;
export const MAX_EXTRA = 10;
export const CARTONES = 4;
export const APUESTAS = [20, 50, 100, 200, 500, 1000]; // centavos por cartón
export const MARGEN_EXTRA = 0.12; // la bola extra cuesta su valor esperado + 12 %

const fila = (r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c);

// Cada figura paga su multiplicador por la apuesta del cartón. Por cartón se paga solo la mejor figura.
export const PATRONES = [
  { id: 'bingo', nombre: 'Bingo', pago: 1500, formas: [[...Array(15).keys()]] },
  { id: 'marco', nombre: 'Marco', pago: 300, formas: [[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14]] },
  { id: 'doble', nombre: 'Doble línea', pago: 100, formas: [[...fila(0), ...fila(1)], [...fila(0), ...fila(2)], [...fila(1), ...fila(2)]] },
  { id: 'piramide', nombre: 'Pirámide', pago: 50, formas: [[2, 6, 7, 8, 10, 11, 12, 13, 14]] },
  { id: 'herradura', nombre: 'Herradura', pago: 40, formas: [[0, 4, 5, 9, 10, 11, 12, 13, 14]] },
  { id: 'w', nombre: 'W', pago: 20, formas: [[0, 4, 5, 7, 9, 11, 13]] },
  { id: 'm', nombre: 'M', pago: 20, formas: [[1, 3, 5, 7, 9, 10, 14]] },
  { id: 'cruz', nombre: 'Cruz', pago: 12, formas: [[2, 5, 6, 7, 8, 9, 12]] },
  { id: 'v', nombre: 'V', pago: 5, formas: [[0, 6, 12, 8, 4]] },
  { id: 'montana', nombre: 'Montaña', pago: 5, formas: [[10, 6, 2, 8, 14]] },
  { id: 'linea', nombre: 'Línea', pago: 3, formas: [fila(0), fila(1), fila(2)] },
  { id: 'esquinas', nombre: 'Esquinas', pago: 1, formas: [[0, 4, 10, 14]] },
];

// Mejor figura completa de un cartón. carton: 15 números (fila por fila); marcadas: Set de bolas.
export function premioCarton(carton, marcadas) {
  for (const p of PATRONES) {
    for (const f of p.formas) {
      if (f.every((i) => marcadas.has(carton[i]))) return { id: p.id, nombre: p.nombre, pago: p.pago, celdas: f };
    }
  }
  return null;
}

// Premio total en centavos de los cartones activos.
export function premioTotal(cartones, activos, apuesta, marcadas) {
  let total = 0;
  const detalle = cartones.map((c, i) => {
    if (!activos[i]) return null;
    const p = premioCarton(c, marcadas);
    if (p) total += p.pago * apuesta;
    return p;
  });
  return { total, detalle };
}

// Qué le falta a cada cartón para la siguiente figura que paga más: números a una bola de distancia.
export function casiPremios(cartones, activos, apuesta, marcadas) {
  const out = [];
  cartones.forEach((c, i) => {
    if (!activos[i]) return;
    const actual = premioCarton(c, marcadas)?.pago || 0;
    for (const p of PATRONES) {
      if (p.pago <= actual) continue;
      for (const f of p.formas) {
        const faltan = f.filter((k) => !marcadas.has(c[k]));
        if (faltan.length === 1) out.push({ carton: i, numero: c[faltan[0]], patron: p.nombre, gana: (p.pago - actual) * apuesta });
      }
    }
  });
  return out;
}

// Precio de la siguiente bola extra a partir del valor esperado exacto de la próxima bola.
export function precioExtra(cartones, activos, apuesta, marcadas, restantes) {
  if (!restantes.length) return { ev: 0, precio: 0, hay: false };
  const base = premioTotal(cartones, activos, apuesta, marcadas).total;
  let suma = 0;
  let mejora = false;
  for (const b of restantes) {
    marcadas.add(b);
    const g = premioTotal(cartones, activos, apuesta, marcadas).total - base;
    marcadas.delete(b);
    if (g > 0) mejora = true;
    suma += g;
  }
  if (!mejora) return { ev: 0, precio: 0, hay: false };
  const ev = suma / restantes.length;
  const apuestaTotal = activos.filter(Boolean).length * apuesta;
  const precio = Math.max(Math.ceil(ev * (1 + MARGEN_EXTRA)), Math.ceil(apuestaTotal * 0.05), 5);
  return { ev, precio, hay: true };
}

// Reparte los 60 números en 4 cartones: cada columna toma 12 números de su decena ampliada.
export function generarCartones(azar = Math.random) {
  const cartones = Array.from({ length: CARTONES }, () => Array(15).fill(0));
  for (let col = 0; col < 5; col++) {
    const nums = Array.from({ length: 12 }, (_, i) => col * 12 + i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    for (let k = 0; k < CARTONES; k++) {
      const tres = nums.slice(k * 3, k * 3 + 3).sort((a, b) => a - b);
      for (let r = 0; r < 3; r++) cartones[k][r * 5 + col] = tres[r];
    }
  }
  return cartones;
}
