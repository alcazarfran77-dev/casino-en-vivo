// Reglas compartidas entre servidor y clientes: tamaños de tabla, modos de victoria y evaluación.

export const TAMANOS = {
  3: 'Rápida 3×3',
  4: 'Clásica 4×4',
  5: 'Grande 5×5',
};

export const MODOS = {
  llena: { nombre: 'Tabla llena', desc: 'Gana quien completa toda su tabla.' },
  linea: { nombre: 'Línea', desc: 'Una fila, columna o diagonal completa.' },
  esquinas: { nombre: 'Cuatro esquinas', desc: 'Las cuatro esquinas de la tabla.' },
  centro: { nombre: 'Centrito', desc: 'El cuadro del centro (4×4: 4 casillas, 5×5: 9).' },
  marco: { nombre: 'Marco', desc: 'Todo el borde de la tabla.' },
};

export function modosDisponibles(n) {
  return Object.keys(MODOS).filter((m) => !(m === 'centro' && n === 3));
}

// Devuelve la lista de patrones (arreglos de índices de casilla) que dan la victoria.
export function patrones(modo, n) {
  const idx = (f, c) => f * n + c;
  const rango = [...Array(n).keys()];
  switch (modo) {
    case 'linea': {
      const p = [];
      for (const f of rango) p.push(rango.map((c) => idx(f, c)));
      for (const c of rango) p.push(rango.map((f) => idx(f, c)));
      p.push(rango.map((i) => idx(i, i)));
      p.push(rango.map((i) => idx(i, n - 1 - i)));
      return p;
    }
    case 'esquinas':
      return [[idx(0, 0), idx(0, n - 1), idx(n - 1, 0), idx(n - 1, n - 1)]];
    case 'centro': {
      if (n === 4) return [[5, 6, 9, 10]];
      if (n === 5) return [[6, 7, 8, 11, 12, 13, 16, 17, 18]];
      return [[4]];
    }
    case 'marco': {
      const p = new Set();
      for (const i of rango) {
        p.add(idx(0, i));
        p.add(idx(n - 1, i));
        p.add(idx(i, 0));
        p.add(idx(i, n - 1));
      }
      return [[...p].sort((a, b) => a - b)];
    }
    case 'llena':
    default:
      return [[...Array(n * n).keys()]];
  }
}

// celdas: arreglo de ids de carta; cantadas: Set de ids ya cantados.
// Devuelve { gana, patron, faltan } con el patrón más cercano a completarse.
export function evaluarTabla(celdas, cantadas, modo, n) {
  let mejor = { gana: false, patron: null, faltan: Infinity };
  for (const p of patrones(modo, n)) {
    let faltan = 0;
    for (const i of p) if (!cantadas.has(celdas[i])) faltan++;
    if (faltan < mejor.faltan) mejor = { gana: faltan === 0, patron: p, faltan };
    if (faltan === 0) break;
  }
  return mejor;
}

// Índice (1 = primera carta) en que la tabla quedó completa según el orden cantado; Infinity si no.
export function completadaEn(celdas, posicion, modo, n) {
  let mejor = Infinity;
  let patronMejor = null;
  for (const p of patrones(modo, n)) {
    let max = 0;
    for (const i of p) {
      const pos = posicion.get(celdas[i]);
      if (pos === undefined) {
        max = Infinity;
        break;
      }
      if (pos > max) max = pos;
    }
    if (max < mejor) {
      mejor = max;
      patronMejor = p;
    }
  }
  return { en: mejor, patron: patronMejor };
}
