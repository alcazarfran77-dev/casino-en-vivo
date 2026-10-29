// Piezas compartidas del casino: dinero, fichas, naipes, relojes y sonidos.
import { el, leer, guardar, cartaEl } from './comun.js';
import { CARTAS_TRADICIONALES } from './shared/baraja.js';
import { dinero } from './shared/catalogo.js';
import { PALOS, rangoDe, paloDe, esRoja } from './shared/blackjack.js';

export { dinero };

// ---------- Fichas ----------
export const etiquetaFicha = (v) => (v >= 100000 ? `${v / 100000}K` : v >= 100 ? String(v / 100) : `${v}¢`);

export function fichaCasinoEl(v, { chica = false, puesta = false } = {}) {
  return el('span', { class: 'ficha-casino' + (chica ? ' chica' : '') + (puesta ? ' puesta' : ''), 'data-v': String(v), 'aria-hidden': 'true' }, etiquetaFicha(v));
}

// Pila de fichas que representa un monto: usa la ficha más grande que cabe.
export function fichaParaMonto(monto, fichas) {
  const f = [...fichas].reverse().find((x) => x <= monto) || fichas[0];
  const e = el('span', { class: 'ficha-casino', 'data-v': String(f), title: dinero(monto) }, monto >= 100 ? (monto % 100 ? (monto / 100).toFixed(1) : String(monto / 100)) : etiquetaFicha(monto));
  return e;
}

export function selectorFichas(cont, fichas, { valor, alCambiar, saldo } = {}) {
  let actual = valor ?? leer('casino:ficha', fichas[1] ?? fichas[0]);
  if (!fichas.includes(actual)) actual = fichas[0];
  const botones = fichas.map((v) => {
    const b = el('button', { type: 'button', 'aria-label': `Ficha de ${dinero(v)}`, 'aria-pressed': String(v === actual) }, fichaCasinoEl(v));
    b.addEventListener('click', () => {
      actual = v;
      guardar('casino:ficha', v);
      botones.forEach((x, i) => x.setAttribute('aria-pressed', String(fichas[i] === v)));
      alCambiar?.(v);
      sonido.ficha();
    });
    return b;
  });
  cont.replaceChildren(...botones);
  cont.classList.add('selector-fichas');
  return {
    get valor() {
      return actual;
    },
    saldo(s) {
      botones.forEach((b, i) => (b.disabled = fichas[i] > s));
      if (actual > s) {
        const mejor = [...fichas].reverse().find((x) => x <= s);
        if (mejor) {
          actual = mejor;
          botones.forEach((x, i) => x.setAttribute('aria-pressed', String(fichas[i] === mejor)));
        }
      }
    },
  };
}

// ---------- Naipes ----------
const FIGURAS = { J: 'J', Q: 'Q', K: 'K' };
export function naipeEl(carta, { w, entra = false, retraso = 0 } = {}) {
  const attrs = { class: 'naipe' + (entra ? ' entra' : ''), style: {} };
  if (w) attrs.style['--w'] = w;
  if (retraso) attrs.style.animationDelay = retraso + 'ms';
  if (!carta || carta === '??') {
    const d = el('div', { ...attrs, class: attrs.class + ' dorso', role: 'img', 'aria-label': 'Carta boca abajo' });
    if (w) d.style.setProperty('--w', w);
    return d;
  }
  const r = rangoDe(carta);
  const p = paloDe(carta);
  const s = PALOS[p];
  const figura = Boolean(FIGURAS[r]);
  const n = el(
    'div',
    { class: attrs.class + (esRoja(carta) ? ' roja' : '') + (figura ? ' figura' : ''), role: 'img', 'aria-label': `${r} de ${{ S: 'picas', H: 'corazones', D: 'diamantes', C: 'tréboles' }[p]}` },
    el('span', { class: 'esq' }, r, el('small', {}, s)),
    el('span', { class: 'centro' }, figura ? el('span', {}, r) : r === 'A' ? s : s),
    el('span', { class: 'esq abajo' }, r, el('small', {}, s)),
  );
  if (w) n.style.setProperty('--w', w);
  if (retraso) n.style.animationDelay = retraso + 'ms';
  return n;
}

export function manoEl(cartas, opciones = {}) {
  const cont = el('div', { class: 'mano-cartas' });
  if (opciones.w) cont.style.setProperty('--w', opciones.w);
  cartas.forEach((c, i) => cont.append(naipeEl(c, { ...opciones, entra: opciones.nuevas ? i >= opciones.nuevas : false })));
  return cont;
}

// ---------- Relojes ----------
// Segundos que faltan para un instante del servidor (ms), corrigiendo el desfase de reloj.
export function segundosHasta(instante, desfase = 0) {
  if (!instante) return null;
  return Math.max(0, Math.ceil((instante - desfase - Date.now()) / 1000));
}

// Anima un número de dinero hacia un valor nuevo.
const animaciones = new WeakMap();
export function animarDinero(nodo, nuevo, { signo = false } = {}) {
  const previo = Number(nodo.dataset.valor ?? nuevo);
  nodo.dataset.valor = String(nuevo);
  cancelAnimationFrame(animaciones.get(nodo));
  if (previo === nuevo || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodo.textContent = dinero(nuevo, { signo });
    return;
  }
  const t0 = performance.now();
  const dur = Math.min(1400, 350 + Math.abs(nuevo - previo) / 50);
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const enteros = previo % 100 === 0 && nuevo % 100 === 0;
    const v = previo + (nuevo - previo) * e;
    nodo.textContent = dinero(enteros ? Math.round(v / 100) * 100 : Math.round(v), { signo });
    if (k < 1) animaciones.set(nodo, requestAnimationFrame(paso));
  };
  animaciones.set(nodo, requestAnimationFrame(paso));
  nodo.classList.remove('sube', 'baja');
  void nodo.offsetWidth;
  nodo.classList.add(nuevo > previo ? 'sube' : 'baja');
}

// ---------- Sonidos sintetizados (sin archivos) ----------
let ctxAudio = null;
let silencio = leer('casino:silencio', false);
function audio() {
  if (silencio) return null;
  try {
    ctxAudio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    return ctxAudio;
  } catch {
    return null;
  }
}
function tono(frec, dur, { tipo = 'sine', vol = 0.12, retraso = 0, desliz = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + retraso;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(frec, t);
  if (desliz) o.frequency.exponentialRampToValueAtTime(frec * desliz, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
export const sonido = {
  get silencio() {
    return silencio;
  },
  set silencio(v) {
    silencio = Boolean(v);
    guardar('casino:silencio', silencio);
  },
  despertar() {
    audio();
  },
  ficha: () => tono(1800, 0.05, { tipo: 'triangle', vol: 0.08, desliz: 0.6 }),
  carta: () => tono(500, 0.07, { tipo: 'square', vol: 0.03, desliz: 0.5 }),
  tic: () => tono(2400, 0.02, { tipo: 'square', vol: 0.025 }),
  bola: () => tono(660, 0.12, { tipo: 'sine', vol: 0.1, desliz: 1.5 }),
  gana() {
    [523, 659, 784, 1047].forEach((f, i) => tono(f, 0.22, { tipo: 'triangle', vol: 0.12, retraso: i * 0.09 }));
  },
  grande() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tono(f, 0.28, { tipo: 'triangle', vol: 0.13, retraso: i * 0.1 }));
  },
  pierde: () => tono(220, 0.35, { tipo: 'sawtooth', vol: 0.04, desliz: 0.6 }),
};

// ---------- Íconos de cada juego (dibujados, sin emojis genéricos) ----------

function svgRueda() {
  const n = 12;
  let p = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const color = i === 0 ? '#0c8a55' : i % 2 ? '#c8102e' : '#1a1423';
    p += `<path d="M20 20 L${20 + 17 * Math.cos(a0)} ${20 + 17 * Math.sin(a0)} A17 17 0 0 1 ${20 + 17 * Math.cos(a1)} ${20 + 17 * Math.sin(a1)} Z" fill="${color}"/>`;
  }
  return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="19.5" fill="#8b5a2b" stroke="#1a1423" stroke-width="1.5"/>${p}<circle cx="20" cy="20" r="8" fill="#a8703c" stroke="#1a1423" stroke-width="1.2"/><circle cx="20" cy="20" r="2.6" fill="#ffb21f"/><circle cx="31" cy="12" r="2.4" fill="#fff" stroke="#1a1423" stroke-width=".8"/></svg>`;
}

export function iconoJuego(juego) {
  const caja = el('span', { class: 'icono', 'aria-hidden': 'true' });
  if (juego === 'ruleta') caja.innerHTML = svgRueda();
  else if (juego === 'blackjack') {
    const a = naipeEl('AS', { w: '24px' });
    const k = naipeEl('KH', { w: '24px' });
    a.style.transform = 'rotate(-8deg)';
    k.style.transform = 'rotate(8deg) translate(-8px, 2px)';
    caja.append(el('span', { style: { display: 'flex' } }, a, k));
  } else if (juego === 'videobingo') caja.append(el('span', { class: 'bola', style: { '--d': '36px', '--c': '#e4007c' } }, '7'));
  else if (juego === 'loteria') {
    const c = el('span', { style: { width: '28px', display: 'block', transform: 'rotate(-6deg)' } }, cartaEl(CARTAS_TRADICIONALES[0], { numero: 1, indice: 0, mostrarNumero: false }));
    caja.append(c);
  }
  return caja;
}
