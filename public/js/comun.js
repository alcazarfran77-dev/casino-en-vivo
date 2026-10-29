// Utilidades compartidas por las pantallas del anfitrión, el jugador y el editor.
import { SVG_ARTE, colorDe } from './shared/baraja.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, x] of Object.entries(v)) {
        if (p.startsWith('--')) e.style.setProperty(p, x);
        else e.style[p] = x;
      }
    }
    else if (k.startsWith('--')) e.style.setProperty(k, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return e;
}

// ---------- Cartas ----------
// opciones: { numero, imgSrc, estilo: 'arte'|'completa', indice }
export function cartaEl(carta, { numero, imgSrc, estilo = 'arte', indice = 0, mostrarNumero = true } = {}) {
  const c = colorDe(carta, indice);
  const completa = estilo === 'completa' && imgSrc;
  const arte = el('div', { class: 'carta-arte' });
  if (imgSrc) arte.append(el('img', { src: imgSrc, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }));
  else if (carta.arte?.startsWith('svg:') && SVG_ARTE[carta.arte.slice(4)]) arte.innerHTML = SVG_ARTE[carta.arte.slice(4)];
  else arte.append(el('span', { class: 'emoji', 'aria-hidden': 'true' }, carta.arte || '🎴'));
  if (mostrarNumero && numero && !completa) arte.append(el('span', { class: 'carta-num' }, numero));
  const marco = el('div', { class: 'carta-marco' }, arte);
  if (!completa) marco.append(el('div', { class: 'carta-nombre', '--largo': String(Math.max(6, carta.nombre.length)) }, carta.nombre));
  return el('div', { class: 'carta' + (completa ? ' completa' : ''), '--c': c, role: 'img', 'aria-label': carta.nombre }, el('div', { class: 'carta-papel' }, marco));
}

export function reversoEl(rev = {}, imgSrc) {
  const cara = el('div', { class: 'reverso-cara' });
  if (imgSrc) cara.append(el('img', { src: imgSrc, alt: '' }));
  else {
    const t = rev.texto || 'LOTERÍA';
    cara.append(el('div', { class: 'reverso-sello', '--largo': String(Math.max(5, t.length)) }, t));
  }
  return el('div', { class: 'reverso', '--c1': rev.color1 || '#7a1450', '--c2': rev.color2 || '#1f5bb5', 'aria-hidden': 'true' }, el('div', { class: 'reverso-papel' }, cara));
}

export function cabezaTablaEl(enc = {}, imgSrc) {
  return el(
    'header',
    { class: 'tabla-cabeza' },
    imgSrc ? el('img', { src: imgSrc, alt: '' }) : null,
    el('div', { class: 'tabla-titulo' }, enc.texto || 'LOTERÍA', enc.subtitulo ? el('span', { class: 'tabla-sub' }, enc.subtitulo) : null),
  );
}

// Ficha de marcar: frijol (dibujado), emoji o tache
export const FICHAS = {
  frijol: { nombre: 'Frijolito' },
  maiz: { nombre: 'Maíz', emoji: '🌽' },
  moneda: { nombre: 'Moneda', emoji: '🪙' },
  corazon: { nombre: 'Corazón', emoji: '❤️' },
  tache: { nombre: 'Tache' },
};
export function fichaEl(tipo = 'frijol', cae = false, semilla = 0) {
  const r = ((semilla * 47) % 70) - 35 + 'deg';
  const f = FICHAS[tipo] || FICHAS.frijol;
  if (f.emoji) return el('span', { class: 'ficha ficha-emoji' + (cae ? ' cae' : ''), '--r': r, 'aria-hidden': 'true' }, f.emoji);
  return el('span', { class: `ficha ficha-${tipo === 'tache' ? 'tache' : 'frijol'}` + (cae ? ' cae' : ''), '--r': r, 'aria-hidden': 'true' });
}

// ---------- Baraja de una sala ----------
export async function cargarBarajaSala(codigo) {
  const r = await fetch(`/api/sala/${codigo}/baraja`, { cache: 'no-store' });
  if (!r.ok) throw new Error('No se pudo cargar la baraja');
  const b = await r.json();
  const porId = new Map();
  b.cartas.forEach((c, i) => porId.set(c.id, { ...c, indice: i, numero: i + 1 }));
  const src = (clave, tiene) => (tiene ? `/api/sala/${codigo}/img/${encodeURIComponent(clave)}?v=${b.version}` : null);
  return {
    ...b,
    porId,
    imgDe: (c) => src(c.id, c.img),
    reversoSrc: src('reverso', b.reverso?.img),
    encabezadoSrc: src('encabezado', b.encabezado?.img),
  };
}

// Dibuja una carta de la baraja de la sala por id.
export function cartaDeSala(baraja, id) {
  const c = baraja.porId.get(id);
  if (!c) return el('div', { class: 'carta' }, el('div', { class: 'carta-papel' }));
  return cartaEl(c, { numero: c.numero, imgSrc: baraja.imgDe(c), estilo: baraja.estiloImagen, indice: c.indice });
}

export function tablaEl(baraja, tabla, n, { chica = false, marcas, ficha = 'frijol', patron, onCelda } = {}) {
  const enc = baraja.encabezado || {};
  const rejilla = el('div', { class: 'tabla-rejilla' });
  tabla.celdas.forEach((id, i) => {
    const celda = el(chica ? 'div' : 'button', { class: 'celda', 'data-i': i, type: chica ? null : 'button', 'aria-label': baraja.porId.get(id)?.nombre });
    celda.append(cartaDeSala(baraja, id));
    if (marcas?.has(i)) celda.append(fichaEl(ficha, false, i + tabla.id.length));
    if (patron?.includes(i)) celda.classList.add('patron');
    if (onCelda && !chica) celda.addEventListener('click', () => onCelda(i, celda));
    rejilla.append(celda);
  });
  return el('div', { class: 'tabla' + (chica ? ' chica' : '') + (patron ? ' ganadora' : ''), '--n': String(n), '--c': enc.color || '#e4007c', 'data-id': tabla.id }, el('div', { class: 'tabla-interior' }, cabezaTablaEl(enc, baraja.encabezadoSrc), rejilla));
}

// ---------- Voz del gritón ----------
let voces = [];
function cargarVoces() {
  if (!('speechSynthesis' in window)) return [];
  voces = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('es'));
  voces.sort((a, b) => puntajeVoz(b) - puntajeVoz(a));
  return voces;
}
function puntajeVoz(v) {
  const l = v.lang.toLowerCase();
  return (l === 'es-mx' ? 4 : l === 'es-us' || l === 'es-419' ? 3 : 1) + (v.localService ? 0.5 : 0) + (/natural|neural|google|paulina|monica|sabina/i.test(v.name) ? 1 : 0);
}
if ('speechSynthesis' in window) {
  cargarVoces();
  speechSynthesis.addEventListener?.('voiceschanged', cargarVoces);
}
export const vocesEspanol = () => (voces.length ? voces : cargarVoces());

export function hablar(texto, { voz, ritmo = 1, cola = false } = {}) {
  if (!('speechSynthesis' in window) || !texto) return;
  if (!cola) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const lista = vocesEspanol();
  u.voice = lista.find((v) => v.voiceURI === voz) || lista[0] || null;
  u.lang = u.voice?.lang || 'es-MX';
  u.rate = ritmo;
  speechSynthesis.speak(u);
}
export function despertarVoz() {
  // iOS exige que la primera locución venga de un toque del usuario.
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

// ---------- Avisos, confeti, reacciones ----------
export function avisar(texto, tipo = '', ms = 3200) {
  let cont = $('.avisos');
  if (!cont) {
    cont = el('div', { class: 'avisos', role: 'status', 'aria-live': 'polite' });
    document.body.append(cont);
  }
  const a = el('div', { class: 'aviso ' + tipo }, texto);
  cont.append(a);
  setTimeout(() => a.remove(), ms);
}

export function confeti(cantidad = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const capa = el('div', { class: 'confeti', 'aria-hidden': 'true' });
  const colores = ['#e4007c', '#ffa400', '#0c8a55', '#1f5bb5', '#f2611d', '#7a2e8f', '#fbf3de'];
  for (let i = 0; i < cantidad; i++) {
    const p = el('i', {
      style: {
        left: Math.random() * 100 + 'vw',
        background: colores[i % colores.length],
        animationDuration: 2.4 + Math.random() * 2.6 + 's',
        animationDelay: Math.random() * 0.9 + 's',
      },
      '--dx': (Math.random() - 0.5) * 30 + 'vw',
      '--rot': (Math.random() - 0.5) * 900 + 'deg',
    });
    capa.append(p);
  }
  document.body.append(capa);
  setTimeout(() => capa.remove(), 6500);
}

export function reaccionVuela(emoji, nombre) {
  let capa = $('.reacciones-capa');
  if (!capa) {
    capa = el('div', { class: 'reacciones-capa', 'aria-hidden': 'true' });
    document.body.append(capa);
  }
  const r = el('div', { class: 'reaccion-vuela', style: { left: 6 + Math.random() * 84 + '%' }, '--giro': (Math.random() - 0.5) * 40 + 'deg' }, el('b', {}, emoji), nombre ? el('span', {}, nombre) : null);
  capa.append(r);
  setTimeout(() => r.remove(), 3300);
}

// Barra de cuenta regresiva hacia un instante (ms epoch del servidor ajustado)
export function animarCuenta(barra, desde, hasta) {
  const i = barra.querySelector('i');
  i.style.transition = 'none';
  if (!hasta) {
    i.style.transform = 'scaleX(0)';
    return;
  }
  const total = Math.max(1, hasta - desde);
  const restante = Math.max(0, hasta - Date.now());
  i.style.transform = `scaleX(${1 - restante / total})`;
  void i.offsetWidth;
  i.style.transition = `transform ${restante}ms linear`;
  i.style.transform = 'scaleX(1)';
}

// Mantener la pantalla encendida durante la partida
let bloqueoPantalla = null;
export async function pantallaEncendida(activa) {
  try {
    if (activa && !bloqueoPantalla && 'wakeLock' in navigator) {
      bloqueoPantalla = await navigator.wakeLock.request('screen');
      bloqueoPantalla.addEventListener('release', () => (bloqueoPantalla = null));
    } else if (!activa && bloqueoPantalla) {
      await bloqueoPantalla.release();
      bloqueoPantalla = null;
    }
  } catch {
    /* sin soporte o sin permiso: no pasa nada */
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.dataset.encendida === '1') pantallaEncendida(true);
});

export const formatoCodigo = (c) => (c ? `${c.slice(0, 3)} ${c.slice(3)}` : '');

export const leer = (k, def) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : JSON.parse(v);
  } catch {
    return def;
  }
};
export const guardar = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
};
