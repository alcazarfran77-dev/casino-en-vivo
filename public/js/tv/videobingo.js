// Videobingo en la tele: bola grande, tablero de los 60 números y premios de cada jugador.
import { el } from '../comun.js';
import { SORTEO } from '../shared/videobingo.js';
import { dinero, segundosHasta, sonido } from '../casino-comun.js';
import { bolaEl, colorBola, tablaPagosEl } from '../componentes/bingo.js';

const TIEMPOS = [
  [0, 'El anfitrión sortea'],
  [15, '15 s'],
  [20, '20 s'],
  [30, '30 s'],
  [45, '45 s'],
];
const EXTRAS = [15, 25, 40];
const FASES = { apuestas: 'Compren sus cartones', sorteo: 'Sorteo en curso', extras: 'Bolas extra en los celulares', pagos: 'Resultados' };

export function crear(ctx) {
  let estado = null;
  let reloj = null;
  let ultimaBola = null;
  const r = {};

  function pintarReloj() {
    if (!estado) return;
    const fin = estado.fase === 'apuestas' ? estado.cierreEn : estado.fase === 'extras' ? estado.finExtrasEn : null;
    const s = segundosHasta(fin, ctx.desfase());
    r.reloj.textContent = s === null ? '' : String(s);
  }

  function pintar() {
    const e = estado;
    pintarReloj();
    r.fase.textContent = FASES[e.fase];
    r.btnSortear.hidden = e.fase !== 'apuestas';
    r.btnSortear.disabled = !e.participantes.length;
    r.ayuda.textContent = e.fase === 'apuestas' ? (e.participantes.length ? `${e.participantes.length} ${e.participantes.length === 1 ? 'jugador compró' : 'jugadores compraron'} cartones.` : 'Cada quien elige cuántos cartones y cuánto apuesta en su celular.') : e.fase === 'extras' ? 'Quien quedó a un número de un premio puede comprar bolas extra.' : '';
    // Bola actual y tablero
    const ult = e.bolas[e.bolas.length - 1];
    if (ult !== ultimaBola) {
      ultimaBola = ult;
      r.bola.replaceChildren(ult ? bolaEl(ult, { sale: true }) : el('div', { class: 'bola', style: { '--c': '#555' } }, '?'));
    }
    r.cuenta.textContent = e.bolas.length ? `Bola ${e.bolas.length} de ${SORTEO}` : 'Esperando el sorteo';
    const salieron = new Set(e.bolas);
    r.tablero.replaceChildren(...Array.from({ length: 60 }, (_, i) => el('span', { class: (salieron.has(i + 1) ? 'salio' : '') + (ult === i + 1 ? ' ultima' : ''), '--c': colorBola(i + 1) }, String(i + 1))));
    // Jugadores
    const lista = e.fase === 'pagos' ? e.ganadores : [...e.participantes].sort((a, b) => (b.premio || 0) - (a.premio || 0));
    r.titulo.textContent = e.fase === 'pagos' ? (e.ganadores.length ? 'Ganadores' : 'Nadie ganó esta vez') : 'Jugando esta ronda';
    r.lista.replaceChildren(
      ...lista.slice(0, 12).map((p) =>
        el(
          'li',
          {},
          el('span', {}, p.avatar),
          el('span', { class: 'nom' }, `${p.nombre}${p.cartones ? ` · ${p.cartones} ${p.cartones === 1 ? 'cartón' : 'cartones'}` : ''}${p.extras ? ` · ${p.extras} extra` : ''}`),
          e.fase === 'pagos' ? el('span', { class: 'dinero positivo' }, dinero(p.neto, { signo: true })) : el('span', { class: 'dinero' }, p.premio ? dinero(p.premio) : p.terminado ? 'cobró' : ''),
        ),
      ),
    );
  }

  return {
    montar(cont) {
      r.fase = el('p', { class: 'fase-grande' });
      r.reloj = el('span', { class: 'reloj-grande' });
      r.btnSortear = el('button', { class: 'btn btn-cempa', type: 'button' }, 'Sortear ahora');
      r.btnSortear.addEventListener('click', async () => {
        const x = await ctx.accion('sortear');
        if (!x.ok && x.error) ctx.avisar(x.error, 'error');
      });
      r.ayuda = el('p', { class: 'suave', style: { margin: '.4rem 0 0' } });
      r.bola = el('div');
      r.cuenta = el('div', { class: 'fase-grande' });
      r.tablero = el('div', { class: 'tablero-60' });
      r.titulo = el('h3');
      r.lista = el('ul', { class: 'lista-apostadores', style: { maxHeight: '38vh' } });
      const raiz = el(
        'div',
        { class: 'tv-videobingo' },
        el('div', { class: 'sorteo' }, el('div', { class: 'bola-actual' }, r.bola, el('div', {}, r.cuenta, el('p', { class: 'suave', style: { margin: '.3rem 0 0' } }, '30 bolas de 60. Los 4 cartones de cada jugador reparten los 60 números.'))), r.tablero, el('div', { class: 'panel', style: { color: 'var(--tinta)', background: 'var(--papel)' } }, tablaPagosEl({ apuesta: 0 }))),
        el('div', { style: { display: 'grid', gap: '1rem' } }, el('div', { class: 'panel' }, el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' } }, r.fase, r.reloj), el('div', { class: 'controles-mesa', style: { marginTop: '.5rem' } }, r.btnSortear), r.ayuda), el('div', { class: 'panel' }, r.titulo, r.lista)),
      );
      cont.replaceChildren(raiz);
      reloj = setInterval(pintarReloj, 250);
    },
    actualizar(m) {
      estado = m;
      pintar();
    },
    evento(tipo) {
      if (tipo === 'bola') sonido.bola();
      if (tipo === 'pagos' && estado?.ganadores?.length) sonido.gana();
    },
    tecla(ev) {
      if (ev.key === ' ' && estado?.fase === 'apuestas') {
        ev.preventDefault();
        ctx.accion('sortear');
      }
    },
    formReglas(cont, a) {
      cont.replaceChildren(
        el('fieldset', { class: 'grupo' }, el('legend', {}, 'Tiempo para comprar cartones'), el('div', { class: 'opciones' }, ...TIEMPOS.map(([v, t]) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'tiempo', value: String(v), checked: a.tiempo === v }), el('span', {}, t))))),
        el('fieldset', { class: 'grupo' }, el('legend', {}, 'Tiempo para bolas extra'), el('div', { class: 'opciones' }, ...EXTRAS.map((v) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'extras', value: String(v), checked: a.extras === v }), el('span', {}, `${v} s`)))), el('small', {}, 'Al terminar el tiempo se cobra el premio de quien no haya decidido.')),
      );
      return () => ({ ajustes: { tiempo: Number(cont.querySelector('input[name="tiempo"]:checked').value), extras: Number(cont.querySelector('input[name="extras"]:checked').value) } });
    },
    desmontar() {
      clearInterval(reloj);
    },
  };
}
