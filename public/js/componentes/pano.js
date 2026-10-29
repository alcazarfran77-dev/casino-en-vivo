// Paño de ruleta vertical para celular. Cada casilla es un pleno; las orillas y esquinas
// entre casillas son caballos, cuadros, calles y seisenas, como en la mesa real.
import { el } from '../comun.js';
import { VARIANTES, DOBLE_CERO, claveDe, colorDe, etiqueta, apuestasValidas } from '../shared/ruleta.js';
import { fichaParaMonto } from '../casino-comun.js';
import { FICHAS } from '../shared/ruleta.js';

export function crearPano(cont, variante, { alApostar, alResaltar } = {}) {
  const V = VARIANTES[variante];
  const validas = apuestasValidas(variante);
  const americana = V.ceros.includes(DOBLE_CERO);
  const fr = V.partage;
  const tablero = el('div', { class: 'pano', role: 'group', 'aria-label': `Paño de ${V.nombre}` });
  cont.replaceChildren(tablero);
  let posiciones = new Map(); // clave → {x, y}
  let celdasPorNum = new Map();
  let celdasExt = new Map();
  let apuestas = [];
  let cerrado = false;

  const cubre = (clave) => validas.get(clave)?.numeros || [];

  function resaltar(clave, on) {
    for (const n of cubre(clave)) celdasPorNum.get(n)?.classList.toggle('luz', on);
    celdasExt.get(clave)?.classList.toggle('luz', on);
  }

  function destello(clave) {
    resaltar(clave, true);
    setTimeout(() => resaltar(clave, false), 280);
  }

  function hotspot(clave, x, y, w, h, etiquetaAria) {
    if (!validas.has(clave)) return;
    const b = el('div', { class: 'h', role: 'button', tabindex: '-1', 'aria-label': etiquetaAria || validas.get(clave).nombre, style: { left: x - w / 2 + 'px', top: y - h / 2 + 'px', width: w + 'px', height: h + 'px' } });
    // Con mouse se ilumina al pasar; con el dedo solo un instante al tocar
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && resaltar(clave, true));
    b.addEventListener('pointerleave', () => resaltar(clave, false));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (cerrado) return;
      destello(clave);
      alApostar?.(clave);
    });
    tablero.append(b);
    posiciones.set(clave, { x, y });
  }

  function celda(clase, clave, x, y, w, h, contenido, etiquetaAria) {
    const c = el('div', { class: 'c ' + clase, role: 'button', tabindex: '0', 'aria-label': etiquetaAria, style: { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' } }, contenido);
    const activar = () => {
      if (cerrado) return;
      destello(clave);
      alApostar?.(clave);
    };
    c.addEventListener('click', activar);
    c.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activar();
      }
    });
    c.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && resaltar(clave, true));
    c.addEventListener('pointerleave', () => resaltar(clave, false));
    tablero.append(c);
    return c;
  }

  function construir() {
    const W = tablero.clientWidth;
    if (!W) return;
    tablero.querySelectorAll('.c, .h, .puestas').forEach((x) => x.remove());
    posiciones = new Map();
    celdasPorNum = new Map();
    celdasExt = new Map();
    const pad = 4;
    const ws = Math.round(W * 0.13);
    const wd = Math.round(W * 0.11);
    const x0 = pad + ws + wd; // inicio de los números
    const wn = W - x0 - pad;
    const cw = wn / 3;
    const fila = Math.round(Math.min(38, Math.max(28, cw * 0.36)));
    const hz = Math.round(fila * 1.3);
    const y0 = pad + hz;
    const altoNums = fila * 12;
    tablero.style.height = pad * 2 + hz + altoNums + fila + 'px';
    tablero.style.setProperty('--fs', Math.round(fila * 0.48) + 'px');

    // Ceros
    if (americana) {
      celdasPorNum.set(0, celda('verde', claveDe([0]), x0, pad, wn / 2, hz, el('span', {}, '0'), 'Pleno 0'));
      celdasPorNum.set(DOBLE_CERO, celda('verde', claveDe([DOBLE_CERO]), x0 + wn / 2, pad, wn / 2, hz, el('span', {}, '00'), 'Pleno 00'));
    } else celdasPorNum.set(0, celda('verde', claveDe([0]), x0, pad, wn, hz, el('span', {}, '0'), 'Pleno 0'));

    // Números
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 3; c++) {
        const n = 3 * r + c + 1;
        celdasPorNum.set(n, celda('num ' + colorDe(n), claveDe([n]), x0 + c * cw, y0 + r * fila, cw, fila, el('span', {}, String(n)), `Pleno ${n}, ${colorDe(n)}`));
      }
    }
    // Columnas
    for (let c = 0; c < 3; c++) {
      const k = 'c' + (c + 1);
      celdasExt.set(k, celda('ext', k, x0 + c * cw, y0 + altoNums, cw, fila, el('span', {}, '2 a 1'), validas.get(k).nombre));
    }
    // Docenas (verticales, cada una cubre 4 filas)
    ['d1', 'd2', 'd3'].forEach((k, i) => {
      const t = fr ? validas.get(k).fr : ['1.ª 12', '2.ª 12', '3.ª 12'][i];
      celdasExt.set(k, celda('ext vert', k, pad + ws, y0 + i * 4 * fila, wd, 4 * fila, el('span', {}, t), validas.get(k).nombre));
    });
    // Suertes sencillas (verticales, 2 filas cada una)
    const sencillas = [
      ['falta', fr ? 'Manque' : '1-18'],
      ['par', fr ? 'Pair' : 'Par'],
      ['rojo', null],
      ['negro', null],
      ['impar', fr ? 'Impair' : 'Impar'],
      ['pasa', fr ? 'Passe' : '19-36'],
    ];
    sencillas.forEach(([k, t], i) => {
      const cont = t ? el('span', {}, t) : el('span', { class: 'rombo', style: { background: k === 'rojo' ? 'var(--ruleta-rojo)' : 'var(--ruleta-negro)' } });
      celdasExt.set(k, celda('ext vert', k, pad, y0 + i * 2 * fila, ws, 2 * fila, cont, validas.get(k).nombre));
    });

    // Orillas entre números
    const hb = 14; // grosor de las orillas
    for (let r = 0; r < 12; r++) {
      const a = 3 * r + 1;
      const yc = y0 + r * fila + fila / 2;
      hotspot(claveDe([a, a + 1]), x0 + cw, yc, hb, fila * 0.62);
      hotspot(claveDe([a + 1, a + 2]), x0 + 2 * cw, yc, hb, fila * 0.62);
      hotspot(claveDe([a, a + 1, a + 2]), x0, yc, hb + 4, fila * 0.62, `Calle ${a}-${a + 1}-${a + 2}`);
      if (r < 11) {
        const yb = y0 + (r + 1) * fila;
        for (let c = 0; c < 3; c++) hotspot(claveDe([a + c, a + c + 3]), x0 + c * cw + cw / 2, yb, cw * 0.6, hb);
        hotspot(claveDe([a, a + 1, a + 3, a + 4]), x0 + cw, yb, hb + 4, hb + 4);
        hotspot(claveDe([a + 1, a + 2, a + 4, a + 5]), x0 + 2 * cw, yb, hb + 4, hb + 4);
        hotspot(claveDe([a, a + 1, a + 2, a + 3, a + 4, a + 5]), x0, yb, hb + 6, hb + 4, `Seisena ${a} a ${a + 5}`);
      }
    }
    // Orillas con los ceros
    if (americana) {
      hotspot(claveDe([0, DOBLE_CERO]), x0 + wn / 2, pad + hz / 2, hb, hz * 0.6);
      hotspot(claveDe([0, 1]), x0 + cw / 2, y0, cw * 0.6, hb);
      hotspot(claveDe([0, 2]), x0 + cw + cw * 0.25, y0, cw * 0.3, hb);
      hotspot(claveDe([DOBLE_CERO, 2]), x0 + cw + cw * 0.75, y0, cw * 0.3, hb);
      hotspot(claveDe([DOBLE_CERO, 3]), x0 + 2 * cw + cw / 2, y0, cw * 0.6, hb);
      hotspot(claveDe([0, 1, 2]), x0 + cw, y0, hb + 4, hb + 4);
      hotspot(claveDe([0, DOBLE_CERO, 2]), x0 + 1.5 * cw, y0, hb + 4, hb + 4);
      hotspot(claveDe([DOBLE_CERO, 2, 3]), x0 + 2 * cw, y0, hb + 4, hb + 4);
      hotspot(claveDe([0, DOBLE_CERO, 1, 2, 3]), x0, y0, hb + 8, hb + 8, 'Cinco números 0-00-1-2-3');
    } else {
      for (let c = 0; c < 3; c++) hotspot(claveDe([0, c + 1]), x0 + c * cw + cw / 2, y0, cw * 0.6, hb);
      hotspot(claveDe([0, 1, 2]), x0 + cw, y0, hb + 4, hb + 4);
      hotspot(claveDe([0, 2, 3]), x0 + 2 * cw, y0, hb + 4, hb + 4);
      hotspot(claveDe([0, 1, 2, 3]), x0, y0, hb + 8, hb + 8, 'Cuadro 0-1-2-3');
    }
    // Posiciones de las fichas en casillas y apuestas exteriores
    for (const [n, c] of celdasPorNum) posiciones.set(claveDe([n]), { x: parseFloat(c.style.left) + parseFloat(c.style.width) / 2, y: parseFloat(c.style.top) + parseFloat(c.style.height) / 2 });
    for (const [k, c] of celdasExt) posiciones.set(k, { x: parseFloat(c.style.left) + parseFloat(c.style.width) / 2, y: parseFloat(c.style.top) + parseFloat(c.style.height) / 2 });
    tablero.append(el('div', { class: 'puestas' }));
    pintarFichas();
  }

  function pintarFichas() {
    const capa = tablero.querySelector('.puestas');
    if (!capa) return;
    capa.replaceChildren(
      ...apuestas
        .filter((a) => posiciones.has(a.clave))
        .map((a) => {
          const p = posiciones.get(a.clave);
          const f = fichaParaMonto(a.monto, FICHAS);
          f.style.left = p.x + 'px';
          f.style.top = p.y + 'px';
          return f;
        }),
    );
  }

  const obs = new ResizeObserver(() => construir());
  obs.observe(tablero);
  construir();

  return {
    ponerApuestas(lista) {
      apuestas = lista || [];
      pintarFichas();
    },
    cerrar(v) {
      cerrado = v;
      tablero.classList.toggle('cerrado', v);
    },
    ganador(n) {
      tablero.querySelectorAll('.gano').forEach((x) => x.classList.remove('gano'));
      if (n === null || n === undefined) return;
      celdasPorNum.get(n)?.classList.add('gano');
    },
    destruir() {
      obs.disconnect();
    },
  };
}

export function historialEl(nums, max = 14) {
  return el('div', { class: 'historial-numeros', 'aria-label': 'Últimos números' }, ...nums.slice(0, max).map((n) => el('span', { class: colorDe(n) }, etiqueta(n))));
}
