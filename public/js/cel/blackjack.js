// Blackjack en el celular: apostar, tomar seguro y jugar tus manos.
import { el } from '../comun.js';
import { VARIANTES, FICHAS, consejo, textoTotal } from '../shared/blackjack.js';
import { dinero, segundosHasta, selectorFichas, manoEl, sonido } from '../casino-comun.js';
import { TEXTO_FASE, etiquetaMano } from '../tv/blackjack.js';

const NOMBRES_ACCION = { pedir: 'Pedir', plantarse: 'Plantarse', doblar: 'Doblar', dividir: 'Dividir', rendirse: 'Rendirse' };
const CONSEJO = { pedir: 'pedir carta', plantarse: 'plantarte', doblar: 'doblar', dividir: 'dividir', rendirse: 'rendirte' };

export function crear(ctx) {
  const R = VARIANTES[ctx.variante];
  let estado = null;
  let selector = null;
  let reloj = null;
  let verConsejo = true;
  const cuentas = new Map();
  let avisado = null;
  const r = {};

  const hacer = async (tipo, datos) => {
    const x = await ctx.accion(tipo, datos);
    if (!x.ok && x.error) ctx.avisar(x.error, 'error');
    return x;
  };

  function manoAnim(clave, cartas, w) {
    const antes = cuentas.get(clave) ?? 0;
    cuentas.set(clave, cartas.length);
    if (cartas.length > antes) sonido.carta();
    return manoEl(cartas, { w, nuevas: antes });
  }

  function relojTexto(e) {
    const fin = e.fase === 'apuestas' ? e.cierreEn : e.fase === 'seguro' ? e.finSeguroEn : e.fase === 'turnos' ? e.finTurnoEn : null;
    const s = segundosHasta(fin, ctx.desfase());
    return s === null ? '' : `${s} s`;
  }
  function pintarReloj() {
    if (estado) r.reloj.textContent = relojTexto(estado);
  }

  function zona(nombre, campo, etiqueta, monto, habilitada) {
    const b = el('button', { type: 'button', class: 'zona-apuesta' + (nombre === 'principal' ? ' principal' : ''), 'aria-label': `${etiqueta}: ${dinero(monto)}. Toca para poner una ficha`, 'aria-disabled': String(!habilitada) }, el('span', {}, etiqueta), el('span', { class: 'dinero' }, monto ? dinero(monto) : '—'));
    b.addEventListener('click', async () => {
      if (!habilitada) return;
      const x = await hacer('apostar', { zona: nombre, ficha: selector.valor });
      if (x.ok) sonido.ficha();
    });
    return b;
  }

  function boton(texto, clase, fn, deshabilitado = false) {
    const b = el('button', { type: 'button', class: 'btn ' + clase, disabled: deshabilitado }, texto);
    b.addEventListener('click', fn);
    return b;
  }

  function pintar() {
    const e = estado;
    const yo = ctx.yo();
    const a = e.asiento;
    if (e.fase === 'apuestas') cuentas.clear();
    pintarReloj();
    r.fase.textContent = TEXTO_FASE[e.fase] || '';
    // Crupier
    const cartas = e.crupier.oculta ? [...e.crupier.cartas, '??'] : e.crupier.cartas;
    r.crupier.replaceChildren(cartas.length ? manoAnim('crupier' + e.ronda, cartas) : el('div', { class: 'suave' }, R.h17 ? 'El crupier pide con 17 blando' : 'El crupier se planta en 17'));
    r.totalCrupier.textContent = e.crupier.cartas.length ? (e.crupier.oculta ? `Muestra ${e.crupier.total}` : e.crupier.total) : '';
    // Mis manos
    const enRonda = a && a.manos.length && e.fase !== 'apuestas';
    r.manos.replaceChildren(
      ...(enRonda
        ? a.manos.map((m, i) => el('div', { class: 'mano' + (i === a.activa && e.fase === 'turnos' && !a.terminado ? ' activa' : '') }, manoAnim(`${e.ronda}-${i}`, m.cartas), etiquetaMano(m, { activa: i === a.activa && !a.terminado, fase: e.fase }), m.apuesta ? el('span', { class: 'suave', style: { fontSize: '.85rem' } }, `Apuesta ${dinero(m.apuesta)}${m.doblada ? ' (doblada)' : ''}`) : null))
        : [el('p', { class: 'suave' }, e.fase === 'apuestas' || !a ? (ctx.solo ? `Apuesta entre ${dinero(R.min)} y ${dinero(R.max)} y reparte.` : 'Pon tu apuesta antes de que se reparta.') : 'Esta ronda no apostaste.')]),
    );
    const lat = [];
    if (a?.laterales?.pares) lat.push(`Pares perfectos: ${a.laterales.pares.nombre}${a.laterales.pares.ganado ? ` (${dinero(a.laterales.pares.ganado - a.laterales.pares.apuesta, { signo: true })})` : ''}`);
    if (a?.laterales?.tresYmas) lat.push(`21+3: ${a.laterales.tresYmas.nombre}${a.laterales.tresYmas.ganado ? ` (${dinero(a.laterales.tresYmas.ganado - a.laterales.tresYmas.apuesta, { signo: true })})` : ''}`);
    r.lat.textContent = e.fase !== 'apuestas' ? lat.join(' · ') : '';
    // Controles según la fase
    const c = [];
    const puedeApostar = e.fase === 'apuestas' || (ctx.solo && e.fase === 'pagos');
    if (e.fase === 'pagos' && a?.resultado) {
      const n = a.resultado.neto;
      c.push(el('p', { class: 'fase-grande', style: { fontSize: '1.5rem', textAlign: 'center', margin: '0 0 .5rem', lineHeight: 1.2 } }, n > 0 ? 'Ganaste ' : n < 0 ? 'Perdiste ' : 'Empate ', el('span', { class: 'dinero ' + (n > 0 ? 'positivo' : n < 0 ? 'negativo' : '') }, n ? dinero(Math.abs(n)) : '')));
      if (avisado !== e.ronda) {
        avisado = e.ronda;
        if (n > 0) {
          sonido.gana();
          ctx.vibrar([60, 40, 120]);
        } else if (n < 0) sonido.pierde();
      }
    }
    if (puedeApostar) {
      const mios = e.fase === 'apuestas' && a ? a : { apuesta: 0, pares: 0, tresYmas: 0 };
      const listo = !ctx.solo && a?.listo;
      const zonas = el('div', { class: 'zonas' });
      if (R.laterales) zonas.append(zona('pares', 'pares', 'Pares perfectos', mios.pares, !listo));
      zonas.append(zona('principal', 'apuesta', 'Apuesta', mios.apuesta, !listo));
      if (R.laterales) zonas.append(zona('tresYmas', 'tresYmas', '21+3', mios.tresYmas, !listo));
      c.push(zonas, r.fichas);
      const fila = el('div', { class: 'fila-botones', style: { justifyContent: 'center' } });
      if (e.fase === 'apuestas') fila.append(boton('Limpiar', 'btn-chico', () => hacer('limpiar'), !mios.apuesta && !mios.pares && !mios.tresYmas));
      if (e.ultimas) fila.append(boton(ctx.solo && e.fase === 'pagos' ? `Repetir ${dinero(e.ultimas.principal + e.ultimas.pares + e.ultimas.tresYmas)} y repartir` : 'Repetir apuesta', 'btn-chico', () => (ctx.solo && e.fase === 'pagos' ? hacer('repartir') : hacer('repetir'))));
      c.push(fila);
      if (ctx.solo) {
        if (e.fase === 'apuestas') c.push(boton('Repartir', 'btn-rosa btn-grande ancho', () => hacer('repartir'), mios.apuesta < R.min));
      } else if (listo) c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Listo. Esperando a los demás…'));
      else c.push(boton('Estoy listo', 'btn-rosa btn-grande ancho', () => hacer('listo'), mios.apuesta < R.min));
    } else if (e.fase === 'seguro') {
      if (a && a.seguro === null) {
        c.push(el('p', { style: { textAlign: 'center', fontWeight: 700 } }, `El crupier muestra un As. ¿Tomas seguro por ${dinero(Math.floor(a.apuesta / 2))}? Paga 2 a 1 si tiene blackjack.`));
        c.push(el('div', { class: 'botones-turno' }, boton('Sí, seguro', 'btn-cempa', () => hacer('seguro', { tomar: true })), boton('No, gracias', '', () => hacer('seguro', { tomar: false }))));
      } else c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, a ? 'Esperando a los demás…' : 'Revisando la carta del crupier…'));
    } else if (e.fase === 'turnos' && a && !a.terminado) {
      const ac = e.acciones || {};
      const botones = ['pedir', 'plantarse', 'doblar', 'dividir'].concat(R.rendicion ? ['rendirse'] : []);
      c.push(el('div', { class: 'botones-turno' }, ...botones.map((t) => boton(NOMBRES_ACCION[t], t === 'pedir' ? 'btn-cempa' : t === 'plantarse' ? 'btn-rosa' : '', () => hacer(t), !ac[t]))));
      const mano = a.manos[a.activa];
      if (mano && verConsejo) {
        const sug = consejo(mano, e.crupier.cartas[0], ac);
        c.push(el('p', { class: 'consejo' }, `Estrategia básica: te conviene ${CONSEJO[sug]} con ${textoTotal(mano.cartas)} contra ${e.crupier.total}.`));
      }
      const t = el('label', { class: 'interruptor', style: { justifyContent: 'center', marginTop: '.4rem', fontSize: '.9rem' } }, el('input', { type: 'checkbox', checked: verConsejo, onchange: (ev) => ((verConsejo = ev.target.checked), pintar()) }), 'Mostrar consejo');
      c.push(t);
    } else if (e.fase === 'turnos' || e.fase === 'reparto' || e.fase === 'crupier') {
      c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, e.fase === 'crupier' ? 'El crupier voltea su carta…' : a ? 'Esperando a los demás…' : 'Ronda en juego. Apuesta en la siguiente.'));
    }
    r.controles.replaceChildren(...c);
    selector.saldo(yo.saldo);
    // Otros jugadores en la mesa en vivo
    if (!ctx.solo) {
      const otros = e.asientos.filter((x) => x.id !== yo.id);
      r.otros.hidden = !otros.length;
      r.otrosLista.replaceChildren(...otros.slice(0, 8).map((x) => el('div', {}, el('span', {}, `${x.avatar} ${x.nombre}`), el('span', { class: 'suave' }, x.resultado && e.fase === 'pagos' ? dinero(x.resultado.neto, { signo: true }) : x.manos.length ? x.manos.map((m) => m.total).join(' / ') : dinero(x.apuesta)))));
    }
  }

  return {
    montar(cont) {
      r.fase = el('span', { style: { fontWeight: 700, flex: 1 } });
      r.reloj = el('span', { class: 'dinero', style: { color: 'var(--oro)' } });
      r.crupier = el('div');
      r.totalCrupier = el('div', { style: { fontWeight: 700 } });
      r.manos = el('div', { class: 'mis-manos' });
      r.lat = el('p', { class: 'suave', style: { textAlign: 'center', fontSize: '.88rem', margin: '0 0 .4rem' } });
      r.controles = el('div');
      r.fichas = el('div');
      r.otrosLista = el('div', { class: 'otros' });
      r.otros = el('div', { class: 'tarjeta', hidden: true }, el('h3', { style: { fontSize: '1rem' } }, 'En la mesa'), r.otrosLista);
      cont.replaceChildren(
        el(
          'div',
          { class: 'cel-bj' },
          el('div', { class: 'ronda-estado' }, r.fase, r.reloj),
          el('div', { class: 'crupier' }, el('div', { class: 'suave', style: { fontWeight: 700 } }, 'Crupier'), r.crupier, r.totalCrupier),
          r.manos,
          r.lat,
          el('div', { class: 'tarjeta' }, r.controles),
          r.otros,
          el('p', { class: 'suave', style: { fontSize: '.82rem' } }, R.reglas.join(' · ')),
        ),
      );
      selector = selectorFichas(r.fichas, FICHAS);
      reloj = setInterval(pintarReloj, 250);
    },
    actualizar(e) {
      estado = e;
      pintar();
    },
    evento(tipo) {
      if (tipo === 'barajar') ctx.avisar('El crupier baraja el zapato', '', 2000);
    },
    desmontar() {
      clearInterval(reloj);
    },
  };
}
