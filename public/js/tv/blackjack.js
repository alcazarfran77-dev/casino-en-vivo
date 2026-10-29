// Blackjack en la tele: el crupier arriba y los asientos de todos los jugadores abajo.
import { el } from '../comun.js';
import { VARIANTES } from '../shared/blackjack.js';
import { dinero, segundosHasta, manoEl, sonido } from '../casino-comun.js';

const TIEMPOS = [
  [0, 'El anfitrión reparte'],
  [10, '10 s'],
  [15, '15 s'],
  [20, '20 s'],
  [30, '30 s'],
];
const TURNOS = [15, 20, 30, 45];

export const TEXTO_FASE = {
  apuestas: 'Hagan sus apuestas',
  reparto: 'Repartiendo…',
  seguro: 'El crupier muestra un As: ¿seguro?',
  turnos: 'Turno de los jugadores',
  crupier: 'Juega el crupier',
  pagos: 'Resultados',
};

export function etiquetaMano(m, { activa, fase }) {
  if (m.resultado) {
    const t = { gana: `Gana ${dinero(m.ganado - m.apuesta, { signo: true })}`, blackjack: `¡Blackjack! ${dinero(m.ganado - m.apuesta, { signo: true })}`, empate: 'Empate', pierde: 'Pierde', rendida: 'Se rindió' }[m.resultado];
    return el('span', { class: 'etiqueta-mano ' + m.resultado }, t);
  }
  const t = { jugando: activa && fase === 'turnos' ? 'Decidiendo…' : m.total, plantada: `Se planta con ${m.total}`, pasada: 'Se pasó', blackjack: '¡Blackjack!', rendida: 'Se rindió' }[m.estado] || m.total;
  return el('span', { class: 'etiqueta-mano' + (m.estado === 'blackjack' ? ' blackjack' : m.estado === 'pasada' ? ' pierde' : '') }, t);
}

export function crear(ctx) {
  const R = VARIANTES[ctx.variante];
  let estado = null;
  let reloj = null;
  const cuentas = new Map(); // clave de mano → cartas ya dibujadas
  const r = {};

  function relojDe(e) {
    const fin = e.fase === 'apuestas' ? e.cierreEn : e.fase === 'seguro' ? e.finSeguroEn : e.fase === 'turnos' ? e.finTurnoEn : null;
    return segundosHasta(fin, ctx.desfase());
  }

  function pintarReloj() {
    if (!estado) return;
    const s = relojDe(estado);
    r.reloj.textContent = s === null ? '' : String(s);
  }

  function manoConAnim(clave, cartas, w) {
    const antes = cuentas.get(clave) ?? 0;
    cuentas.set(clave, cartas.length);
    if (cartas.length > antes) sonido.carta();
    return manoEl(cartas, { w, nuevas: antes });
  }

  function pintar() {
    const e = estado;
    pintarReloj();
    r.fase.textContent = TEXTO_FASE[e.fase] || '';
    r.btnRepartir.hidden = e.fase !== 'apuestas';
    r.btnRepartir.disabled = !e.asientos.some((a) => a.apuesta >= R.min);
    const listos = e.asientos.filter((a) => a.listo).length;
    r.ayuda.textContent =
      e.fase === 'apuestas'
        ? e.asientos.length
          ? `${e.asientos.length} ${e.asientos.length === 1 ? 'jugador apostó' : 'jugadores apostaron'}${listos ? `, ${listos} ${listos === 1 ? 'listo' : 'listos'}` : ''}. Se reparte cuando todos estén listos${e.ajustes.tiempo ? ' o al terminar el reloj' : ''}.`
          : `Apuesta mínima ${dinero(R.min)}, máxima ${dinero(R.max)}.`
        : '';
    // Crupier
    const cartas = e.crupier.oculta ? [...e.crupier.cartas, '??'] : e.crupier.cartas;
    if (e.fase === 'apuestas') cuentas.clear();
    r.crupier.replaceChildren(cartas.length ? manoConAnim('crupier' + e.ronda, cartas) : el('p', { class: 'suave' }, 'Esperando apuestas'));
    r.totalCrupier.textContent = e.crupier.cartas.length ? (e.crupier.oculta ? `Muestra ${e.crupier.total}` : e.crupier.total) : '';
    // Zapato
    r.zapato.firstElementChild.style.width = `${(e.zapato.quedan / e.zapato.total) * 100}%`;
    r.zapatoTexto.textContent = e.zapato.barajado ? 'Zapato recién barajado' : `Quedan ${e.zapato.quedan} cartas en el zapato`;
    // Asientos
    if (!e.asientos.length) {
      r.asientos.replaceChildren(el('p', { class: 'suave' }, 'Los jugadores apuestan desde su celular. Todos juegan a la vez contra el crupier.'));
      return;
    }
    r.asientos.replaceChildren(
      ...e.asientos.map((a) => {
        const total = a.manos.reduce((s, m) => s + m.apuesta, 0) || a.apuesta;
        const lat = [];
        if (a.laterales?.pares) lat.push(`Pares: ${a.laterales.pares.nombre}${a.laterales.pares.ganado ? ' ' + dinero(a.laterales.pares.ganado - a.laterales.pares.apuesta, { signo: true }) : ''}`);
        else if (a.pares) lat.push(`Pares ${dinero(a.pares)}`);
        if (a.laterales?.tresYmas) lat.push(`21+3: ${a.laterales.tresYmas.nombre}${a.laterales.tresYmas.ganado ? ' ' + dinero(a.laterales.tresYmas.ganado - a.laterales.tresYmas.apuesta, { signo: true }) : ''}`);
        else if (a.tresYmas) lat.push(`21+3 ${dinero(a.tresYmas)}`);
        if (a.seguro > 0) lat.push(`Seguro ${dinero(a.seguro)}${a.seguroGanado ? ' pagado' : ''}`);
        return el(
          'div',
          { class: 'asiento' + (a.listo && e.fase === 'apuestas' ? ' listo' : '') },
          el('div', { class: 'cab' }, el('span', {}, a.avatar), el('span', { class: 'nom' }, a.nombre), el('span', { class: 'dinero' }, dinero(total))),
          a.manos.length
            ? el(
                'div',
                { class: 'manos' },
                ...a.manos.map((m, i) => el('div', { class: 'mano' + (i === a.activa && e.fase === 'turnos' && !a.terminado ? ' activa' : '') }, manoConAnim(`${e.ronda}-${a.id}-${i}`, m.cartas), etiquetaMano(m, { activa: i === a.activa && !a.terminado, fase: e.fase }))),
              )
            : el('span', { class: 'suave' }, a.listo ? 'Listo' : 'Apostando…'),
          lat.length ? el('div', { class: 'lat' }, lat.join(' · ')) : null,
          a.resultado && e.fase === 'pagos' ? el('div', { class: 'dinero ' + (a.resultado.neto > 0 ? 'positivo' : a.resultado.neto < 0 ? 'negativo' : '') }, dinero(a.resultado.neto, { signo: true })) : null,
        );
      }),
    );
  }

  return {
    montar(cont) {
      r.fase = el('p', { class: 'fase-grande' });
      r.reloj = el('span', { class: 'reloj-grande' });
      r.btnRepartir = el('button', { class: 'btn btn-cempa', type: 'button' }, 'Repartir ahora');
      r.btnRepartir.addEventListener('click', async () => {
        const x = await ctx.accion('repartir');
        if (!x.ok && x.error) ctx.avisar(x.error, 'error');
      });
      r.ayuda = el('p', { class: 'suave', style: { margin: '.4rem 0 0' } });
      r.crupier = el('div');
      r.totalCrupier = el('div', { class: 'total-crupier' });
      r.zapato = el('div', { class: 'zapato', 'aria-hidden': 'true' }, el('i'));
      r.zapatoTexto = el('div', { class: 'suave', style: { fontSize: '.85rem', marginTop: '.3rem' } });
      r.asientos = el('div', { class: 'asientos' });
      const raiz = el(
        'div',
        { class: 'tv-blackjack' },
        el(
          'div',
          { class: 'crupier' },
          el('div', { class: 'panel' }, el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' } }, r.fase, r.reloj), el('div', { class: 'controles-mesa', style: { marginTop: '.5rem' } }, r.btnRepartir), r.ayuda),
          el('div', { style: { textAlign: 'center' } }, el('div', { class: 'suave', style: { marginBottom: '.4rem', fontWeight: 700 } }, 'Crupier'), r.crupier, r.totalCrupier),
          el('div', { class: 'panel' }, el('h3', {}, R.nombre), r.zapato, r.zapatoTexto, el('p', { class: 'suave', style: { margin: '.5rem 0 0', fontSize: '.88rem' } }, R.reglas.slice(1, 4).join('. ') + '.')),
        ),
        el('p', { class: 'reglas-mesa' }, R.laterales ? 'Apuestas laterales: Pares perfectos (6, 12 o 25 a 1) y 21+3 (5 a 100 a 1).' : 'Blackjack paga 3 a 2. Seguro paga 2 a 1.'),
        r.asientos,
      );
      cont.replaceChildren(raiz);
      reloj = setInterval(pintarReloj, 250);
    },
    actualizar(m) {
      estado = m;
      pintar();
    },
    evento(tipo) {
      if (tipo === 'barajar') ctx.avisar('El crupier baraja el zapato', '', 2500);
      if (tipo === 'pagos' && estado?.ganadores?.length) sonido.gana();
      if (tipo === 'crupierBJ') ctx.hablar('Blackjack del crupier');
    },
    tecla(ev) {
      if (ev.key === ' ' && estado?.fase === 'apuestas') {
        ev.preventDefault();
        ctx.accion('repartir');
      }
    },
    formReglas(cont, a) {
      cont.replaceChildren(
        el('fieldset', { class: 'grupo' }, el('legend', {}, 'Tiempo para apostar'), el('div', { class: 'opciones' }, ...TIEMPOS.map(([v, t]) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'tiempo', value: String(v), checked: a.tiempo === v }), el('span', {}, t))))),
        el(
          'fieldset',
          { class: 'grupo' },
          el('legend', {}, 'Tiempo para decidir'),
          el('div', { class: 'opciones' }, ...TURNOS.map((v) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'turno', value: String(v), checked: a.turno === v }), el('span', {}, `${v} s`)))),
          el('small', {}, 'Todos juegan sus manos al mismo tiempo. Quien no decide a tiempo se planta.'),
        ),
      );
      return () => ({ ajustes: { tiempo: Number(cont.querySelector('input[name="tiempo"]:checked').value), turno: Number(cont.querySelector('input[name="turno"]:checked').value) } });
    },
    desmontar() {
      clearInterval(reloj);
    },
  };
}
