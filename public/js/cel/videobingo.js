// Videobingo en el celular: 4 cartones, apuesta por cartón, sorteo y bolas extra.
import { el } from '../comun.js';
import { APUESTAS, SORTEO } from '../shared/videobingo.js';
import { dinero, segundosHasta, sonido } from '../casino-comun.js';
import { cartonEl, bolaEl, tablaPagosEl } from '../componentes/bingo.js';

const FASES = { apuestas: 'Compra tus cartones', sorteo: 'Sorteo en curso', extras: 'Bolas extra', pagos: 'Resultado' };

export function crear(ctx) {
  let estado = null;
  let reloj = null;
  let animando = null; // { k, total, timer }
  let avisado = null;
  const r = {};

  const hacer = async (tipo, datos) => {
    const x = await ctx.accion(tipo, datos);
    if (!x.ok && x.error) ctx.avisar(x.error, 'error');
    return x;
  };
  function boton(texto, clase, fn, deshabilitado = false) {
    const b = el('button', { type: 'button', class: 'btn ' + clase, disabled: deshabilitado }, texto);
    b.addEventListener('click', fn);
    return b;
  }

  function pintarReloj() {
    if (!estado) return;
    const fin = estado.fase === 'apuestas' ? estado.cierreEn : estado.fase === 'extras' ? estado.finExtrasEn : null;
    const s = ctx.solo ? null : segundosHasta(fin, ctx.desfase());
    r.reloj.textContent = s === null ? '' : `${s} s`;
  }

  function bolasVisibles(e) {
    if (animando) return e.bolas.slice(0, animando.k);
    return e.bolas;
  }

  function pintar() {
    const e = estado;
    pintarReloj();
    const mostrandoSorteo = Boolean(animando);
    r.fase.textContent = mostrandoSorteo ? 'Sorteando…' : FASES[e.fase];
    const visibles = bolasVisibles(e);
    const enJuego = e.comprado && e.fase !== 'apuestas';
    const marcadas = new Set(enJuego ? [...visibles, ...(mostrandoSorteo ? [] : e.extras)] : []);
    const extras = new Set(mostrandoSorteo ? [] : e.extras);
    const casi = new Set(mostrandoSorteo ? [] : (e.casi || []).map((x) => x.numero));
    r.cuenta.textContent = visibles.length ? `Bola ${Math.min(visibles.length, SORTEO)} de ${SORTEO}${extras.size ? ` + ${extras.size} extra` : ''}` : ctx.solo ? '30 bolas de 60' : 'Esperando el sorteo';
    const ultimas = [...visibles, ...extras].slice(-7).reverse();
    r.ultimas.replaceChildren(...ultimas.map((n, i) => bolaEl(n, { sale: i === 0 && mostrandoSorteo })));
    // Premio actual (con las bolas visibles)
    const premio = mostrandoSorteo ? null : e.premio;
    r.premio.textContent = enJuego ? (premio?.total ? dinero(premio.total) : '$0') : '';
    r.premioTexto.textContent = enJuego ? 'Premio' : '';
    // Cartones
    const editable = (e.fase === 'apuestas' && !e.comprado) || (ctx.solo && e.fase === 'pagos');
    r.cartones.replaceChildren(
      ...e.cartones.map((c, i) =>
        cartonEl(c, {
          indice: i,
          marcadas,
          extras,
          activo: e.activos[i],
          casi,
          apuesta: e.apuesta,
          alTocar: editable
            ? () => {
                const activos = [...e.activos];
                activos[i] = !activos[i];
                hacer('configurar', { activos });
              }
            : null,
        }),
      ),
    );
    // Controles
    const c = [];
    const costo = e.costo;
    if (!mostrandoSorteo && e.fase === 'pagos' && e.resultado) {
      const n = e.resultado.neto;
      c.push(el('p', { class: 'fase-grande', style: { fontSize: '1.4rem', textAlign: 'center', margin: '.1rem 0 .5rem' } }, e.resultado.ganado ? ['Ganaste ', el('span', { class: 'dinero positivo' }, dinero(e.resultado.ganado))] : 'Sin premio esta vez'));
      c.push(el('p', { class: 'suave', style: { textAlign: 'center', margin: '0 0 .6rem' } }, `Apostaste ${dinero(e.resultado.apostado)} · neto ${dinero(n, { signo: true })}`));
      if (avisado !== `${e.ronda}`) {
        avisado = `${e.ronda}`;
        if (e.resultado.ganado > e.resultado.apostado) {
          sonido.gana();
          ctx.vibrar([60, 40, 120]);
          if (e.resultado.ganado >= 50000) ctx.confeti(120);
        }
      }
    }
    if (mostrandoSorteo) c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Van saliendo las bolas…'));
    else if (editable) {
      c.push(el('div', { class: 'suave', style: { textAlign: 'center', marginBottom: '.3rem' } }, 'Apuesta por cartón'));
      c.push(el('div', { class: 'apuestas-vb' }, ...APUESTAS.map((v) => boton(dinero(v), 'btn-chico', () => hacer('configurar', { apuesta: v }))).map((b, i) => (b.setAttribute('aria-pressed', String(APUESTAS[i] === e.apuesta)), b))));
      c.push(el('p', { class: 'suave', style: { textAlign: 'center', margin: '.5rem 0' } }, `Toca un cartón para encenderlo o apagarlo. ${e.activos.filter(Boolean).length} cartones × ${dinero(e.apuesta)} = ${dinero(costo)}`));
      c.push(el('div', { class: 'fila-botones', style: { justifyContent: 'center' } }, boton('Cambiar números', 'btn-chico', () => hacer('cambiar')), boton(ctx.solo ? `Jugar por ${dinero(costo)}` : `Comprar por ${dinero(costo)}`, 'btn-rosa btn-grande', async () => {
        const x = await hacer(ctx.solo ? 'jugar' : 'comprar');
        if (x.ok) sonido.ficha();
      }, ctx.yo().saldo < costo)));
    } else if (e.fase === 'apuestas' && e.comprado) {
      c.push(el('p', { style: { textAlign: 'center', fontWeight: 700 } }, `Compraste ${e.activos.filter(Boolean).length} cartones por ${dinero(costo)}. Esperando el sorteo…`));
      c.push(el('div', { class: 'fila-botones', style: { justifyContent: 'center' } }, boton('Cancelar compra', 'btn-chico', () => hacer('cancelar'))));
    } else if (e.fase === 'sorteo') {
      c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, e.comprado ? 'Mira cómo se marcan tus cartones.' : 'Esta ronda ya empezó. Compra cartones en la siguiente.'));
    } else if (e.fase === 'extras' && e.comprado && !e.terminado) {
      const p = e.precio;
      if (e.casi?.length) {
        const mejores = [...e.casi].sort((a, b) => b.gana - a.gana).slice(0, 3);
        c.push(el('ul', { style: { margin: '0 0 .6rem', paddingLeft: '1.2rem' } }, ...mejores.map((x) => el('li', {}, `Con el ${x.numero}: ${x.patron} en el cartón ${x.carton + 1} (+${dinero(x.gana)})`))));
      }
      c.push(
        el(
          'div',
          { class: 'botones-turno', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' } },
          boton(p?.hay ? `Bola extra ${dinero(p.precio)}` : 'Sin bolas extra', 'btn-cempa', async () => {
            const x = await hacer('extra');
            if (x.ok) sonido.bola();
          }, !p?.hay || ctx.yo().saldo < p.precio),
          boton(e.premio?.total ? `Cobrar ${dinero(e.premio.total)}` : 'Terminar sin premio', 'btn-rosa', () => hacer('cobrar')),
        ),
      );
      c.push(el('p', { class: 'suave', style: { textAlign: 'center', fontSize: '.85rem', margin: '.5rem 0 0' } }, `Te quedan ${e.quedanExtras} bolas extra. El precio sale de lo que podrías ganar con la siguiente bola.`));
    } else if (e.fase === 'extras' && e.terminado) {
      c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, `Cobraste ${dinero(e.resultado?.ganado || 0)}. Esperando a los demás…`));
    } else if (!e.comprado && e.fase !== 'pagos') {
      c.push(el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Esta ronda ya empezó. Compra cartones en la siguiente.'));
    }
    r.controles.replaceChildren(...c);
    r.pagos.replaceChildren(tablaPagosEl({ apuesta: e.apuesta, ganados: new Set((e.premio?.detalle || []).filter(Boolean).map((x) => x.id)) }));
  }

  return {
    montar(cont) {
      r.fase = el('span', { style: { fontWeight: 700, flex: 1 } });
      r.reloj = el('span', { class: 'dinero', style: { color: 'var(--oro)' } });
      r.cuenta = el('div', { class: 'suave', style: { fontSize: '.9rem' } });
      r.ultimas = el('div', { class: 'ultimas' });
      r.premio = el('div', { class: 'premio-actual' });
      r.premioTexto = el('div', { class: 'suave', style: { fontSize: '.8rem' } });
      r.cartones = el('div', { class: 'cartones' });
      r.controles = el('div');
      r.pagos = el('div');
      cont.replaceChildren(
        el(
          'div',
          { class: 'cel-vb' },
          el('div', { class: 'ronda-estado' }, r.fase, r.reloj),
          el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '.6rem', alignItems: 'center', marginBottom: '.5rem' } }, el('div', {}, r.ultimas, r.cuenta), el('div', { style: { textAlign: 'right' } }, r.premio, r.premioTexto)),
          r.cartones,
          el('div', { class: 'tarjeta', style: { marginTop: '.7rem' } }, r.controles),
          el('details', { class: 'tarjeta', style: { background: 'var(--papel)', color: 'var(--tinta)' } }, el('summary', { style: { fontWeight: 700, cursor: 'pointer' } }, 'Tabla de premios por cartón'), el('div', { style: { marginTop: '.6rem' } }, r.pagos)),
        ),
      );
      reloj = setInterval(pintarReloj, 250);
    },
    actualizar(e) {
      estado = e;
      pintar();
    },
    evento(tipo, d) {
      if (tipo === 'sorteo' && ctx.solo) {
        // El servidor ya sacó las 30 bolas; aquí se muestran una a una
        clearInterval(animando?.timer);
        animando = { k: 0 };
        animando.timer = setInterval(() => {
          animando.k++;
          if (animando.k % 3 === 0) sonido.tic();
          if (animando.k >= d.bolas.length) {
            clearInterval(animando.timer);
            animando = null;
          }
          if (estado) pintar();
        }, 75);
      } else if (tipo === 'bola' && !ctx.solo && estado?.comprado) sonido.tic();
    },
    desmontar() {
      clearInterval(reloj);
      clearInterval(animando?.timer);
    },
  };
}
