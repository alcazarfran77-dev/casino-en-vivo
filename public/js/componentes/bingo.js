// Cartones, bolas y tabla de pagos del videobingo.
import { el } from '../comun.js';
import { PATRONES, premioCarton } from '../shared/videobingo.js';
import { dinero } from '../casino-comun.js';

const COLORES_BOLA = ['#e4007c', '#ffa400', '#0c8a55', '#1f5bb5', '#7a2e8f'];
export const colorBola = (n) => COLORES_BOLA[Math.min(4, Math.floor((n - 1) / 12))];

export function bolaEl(n, { sale = false, d } = {}) {
  const b = el('div', { class: 'bola' + (sale ? ' sale' : ''), '--c': colorBola(n), role: 'img', 'aria-label': `Bola ${n}` }, String(n));
  if (d) b.style.setProperty('--d', d);
  return b;
}

// marcadas: Set de bolas sorteadas; extras: Set de bolas extra; casi: Set de números que faltan para un premio
export function cartonEl(numeros, { indice = 0, marcadas = new Set(), extras = new Set(), activo = true, casi = new Set(), apuesta = 0, alTocar } = {}) {
  const premio = activo && marcadas.size ? premioCarton(numeros, marcadas) : null;
  const figura = new Set(premio ? premio.celdas : []);
  const rejilla = el('div', { class: 'rejilla' });
  numeros.forEach((n, i) => {
    const m = marcadas.has(n);
    rejilla.append(el('div', { class: 'n' + (m ? ' marcada' : '') + (m && extras.has(n) ? ' extra' : '') + (figura.has(i) ? ' figura' : '') + (!m && casi.has(n) ? ' falta' : '') }, String(n)));
  });
  const pie = el(
    'div',
    { class: 'pie' },
    el('span', {}, `Cartón ${indice + 1}`),
    premio ? el('span', { class: 'premio' }, `${premio.nombre} · ${dinero(premio.pago * apuesta)}`) : el('span', { class: 'suave' }, activo ? '' : 'Apagado'),
  );
  const c = el('div', { class: 'carton' + (activo ? '' : ' apagado'), role: alTocar ? 'button' : null, tabindex: alTocar ? '0' : null, 'aria-pressed': alTocar ? String(activo) : null, 'aria-label': `Cartón ${indice + 1}${activo ? '' : ', apagado'}` }, rejilla, pie);
  if (alTocar) {
    c.style.cursor = 'pointer';
    c.addEventListener('click', alTocar);
    c.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alTocar()));
  }
  return c;
}

export function patronMiniEl(forma) {
  const s = new Set(forma);
  return el('div', { class: 'patron-mini', 'aria-hidden': 'true' }, ...Array.from({ length: 15 }, (_, i) => el('i', { class: s.has(i) ? 'si' : '' })));
}

export function tablaPagosEl({ apuesta = 100, ganados = new Set() } = {}) {
  return el(
    'div',
    { class: 'tabla-pagos' },
    ...PATRONES.map((p) => el('div', { class: ganados.has(p.id) ? 'gana' : '' }, patronMiniEl(p.formas[0]), el('div', {}, el('div', {}, p.nombre), el('b', {}, `${p.pago}×`), apuesta ? el('small', { class: 'suave' }, ` ${dinero(p.pago * apuesta)}`) : null))),
  );
}
