// Ruleta en el celular: paño táctil, fichas y rueda (pequeña en vivo, grande en modo individual).
import { el } from '../comun.js';
import { Rueda } from '../componentes/rueda.js';
import { crearPano, historialEl } from '../componentes/pano.js';
import { VARIANTES, FICHAS, ANUNCIADAS, fichasAnunciada, etiqueta, colorDe, claveDe } from '../shared/ruleta.js';
import { dinero, segundosHasta, selectorFichas, sonido } from '../casino-comun.js';
import { describir } from '../tv/ruleta.js';

function textoNeto(neto, cobrado) {
  if (neto > 0) return ['Ganaste ', el('span', { class: 'dinero positivo' }, dinero(neto, { signo: true }))];
  if (neto === 0) return ['Quedaste a mano'];
  return ['Perdiste ', el('span', { class: 'dinero negativo' }, dinero(-neto)), cobrado ? el('span', { class: 'suave' }, ` (cobraste ${dinero(cobrado)})`) : ''];
}

export function crear(ctx) {
  const V = VARIANTES[ctx.variante];
  let estado = null;
  let pano = null;
  let rueda = null;
  let selector = null;
  let reloj = null;
  let girando = false;
  let vecinos = false;
  let avisado = null;
  const r = {};

  async function apostar(clave) {
    const ficha = selector.valor;
    let datos = { clave, ficha };
    if (vecinos && clave.startsWith('n') && !clave.includes('-')) {
      datos = { anunciada: 'vecinos', numero: Number(clave.slice(1)), ficha };
      vecinos = false;
      pintarAnunciadas();
    }
    const x = await ctx.accion('apostar', datos);
    if (!x.ok) return ctx.avisar(x.error || 'No se pudo apostar.', 'error');
    sonido.ficha();
  }
  async function hacer(tipo) {
    const x = await ctx.accion(tipo);
    if (!x.ok && x.error) ctx.avisar(x.error, 'error');
    else if (tipo !== 'girar') sonido.ficha();
  }

  function pintarAnunciadas() {
    if (!r.anunciadas) return;
    r.anunciadas.querySelectorAll('[data-vecinos]').forEach((b) => b.setAttribute('aria-pressed', String(vecinos)));
  }

  function textoFase(e) {
    const seg = segundosHasta(e.cierreEn, ctx.desfase());
    if (girando || e.fase === 'girando') return 'No va más: la bola está girando…';
    if (e.fase === 'pagos') return null;
    if (ctx.solo) return e.total ? 'Listo para girar' : 'Pon tus fichas en el paño';
    return seg !== null ? `Hagan sus apuestas · ${seg} s` : 'Hagan sus apuestas';
  }

  function pintarReloj() {
    if (!estado) return;
    const t = textoFase(estado);
    if (t) r.fase.textContent = t;
  }

  function pintar() {
    const e = estado;
    const abierta = e.fase === 'apuestas' || (ctx.solo && e.fase === 'pagos');
    pano.ponerApuestas(e.fase === 'pagos' && ctx.solo ? [] : e.apuestas);
    pano.cerrar(!abierta || girando);
    selector.saldo(ctx.yo().saldo);
    r.total.textContent = `Tu apuesta: ${dinero(e.total)}`;
    r.historial.replaceChildren(historialEl(e.historial, 10));
    // Banner de resultado
    const t = textoFase(e);
    if (t) {
      r.fase.textContent = t;
      r.banner.replaceChildren();
      pano.ganador(null);
    } else if (!girando) {
      const res = e.resultado;
      r.fase.textContent = `Salió el ${etiqueta(res)}`;
      const ult = e.ultimo && e.ultimo.ronda === e.ronda ? e.ultimo : null;
      r.banner.replaceChildren(
        el('span', { class: 'numero-grande ' + colorDe(res), style: { fontSize: '1rem', marginRight: '.5rem' } }, etiqueta(res)),
        describir(res),
        ult ? el('div', {}, ...textoNeto(ult.ganado - ult.apostado, ult.ganado)) : el('div', { class: 'suave' }, 'No apostaste en esta ronda.'),
      );
      pano.ganador(res);
      rueda.mostrar(res);
      if (ult && avisado !== `${e.ronda}`) {
        avisado = `${e.ronda}`;
        if (ult.ganado > ult.apostado) {
          sonido.gana();
          ctx.vibrar([60, 40, 120]);
        } else sonido.pierde();
      }
    }
    r.deshacer.disabled = !abierta || !e.puedeDeshacer || e.fase === 'pagos';
    r.limpiar.disabled = !abierta || !e.total || e.fase === 'pagos';
    r.repetir.disabled = !abierta || !e.puedeRepetir;
    r.doblar.disabled = !abierta || !e.total || e.fase === 'pagos';
    if (r.girar) {
      r.girar.disabled = e.fase !== 'apuestas' || !e.total || girando;
      r.girar.textContent = e.fase === 'pagos' ? 'Pon fichas para la siguiente' : 'Girar la rueda';
    }
  }

  return {
    montar(cont) {
      const canvas = el('canvas', { 'aria-label': `Rueda de ${V.nombre}` });
      r.fase = el('div', { style: { fontWeight: 700 } });
      r.banner = el('div', { class: 'banner', 'aria-live': 'polite' });
      r.historial = el('div', { style: { marginTop: '.4rem' } });
      const opciones = el('div', { class: 'tarjeta', style: { padding: '.5rem .6rem' } });
      r.total = el('span');
      const cuerpo = el('div', { class: 'cel-ruleta' + (ctx.solo ? ' solo' : '') }, el('div', { class: 'cabecera' }, el('div', { class: 'rueda' }, canvas), el('div', {}, r.fase, r.banner, r.historial)));
      if (V.anunciadas) {
        r.anunciadas = el('div', { class: 'anunciadas', role: 'group', 'aria-label': 'Apuestas anunciadas' });
        for (const [k, a] of Object.entries(ANUNCIADAS)) {
          const b = el('button', { type: 'button', class: 'btn btn-chico' }, `${V.partage ? a.fr : a.nombre} · ${fichasAnunciada(k)}`);
          b.title = `${a.nombre}: ${fichasAnunciada(k)} fichas`;
          b.addEventListener('click', async () => {
            const x = await ctx.accion('apostar', { anunciada: k, ficha: selector.valor });
            if (!x.ok) ctx.avisar(x.error || 'No se pudo apostar.', 'error');
            else sonido.ficha();
          });
          r.anunciadas.append(b);
        }
        const bv = el('button', { type: 'button', class: 'btn btn-chico', 'data-vecinos': '1', 'aria-pressed': 'false' }, 'Vecinos de un número');
        bv.addEventListener('click', () => {
          vecinos = !vecinos;
          pintarAnunciadas();
          if (vecinos) ctx.avisar('Toca un número: apuestas a él y a dos vecinos de cada lado en la rueda.');
        });
        r.anunciadas.append(bv);
        cuerpo.append(r.anunciadas);
      }
      const contPano = el('div', { style: { marginTop: '.5rem' } });
      cuerpo.append(contPano);
      const contFichas = el('div');
      r.deshacer = el('button', { type: 'button', class: 'btn btn-chico' }, 'Deshacer');
      r.limpiar = el('button', { type: 'button', class: 'btn btn-chico' }, 'Limpiar');
      r.repetir = el('button', { type: 'button', class: 'btn btn-chico' }, 'Repetir');
      r.doblar = el('button', { type: 'button', class: 'btn btn-chico' }, 'Doblar');
      r.deshacer.addEventListener('click', () => hacer('deshacer'));
      r.limpiar.addEventListener('click', () => hacer('limpiar'));
      r.repetir.addEventListener('click', () => hacer('repetir'));
      r.doblar.addEventListener('click', () => hacer('doblar'));
      cuerpo.append(el('div', { class: 'totales' }, r.total, el('span', { class: 'suave' }, V.corto)), contFichas, el('div', { class: 'acciones' }, r.deshacer, r.limpiar, r.repetir, r.doblar));
      if (ctx.solo) {
        r.girar = el('button', { type: 'button', class: 'btn btn-rosa btn-grande girar' }, 'Girar la rueda');
        r.girar.addEventListener('click', () => hacer('girar'));
        cuerpo.append(r.girar);
      }
      cuerpo.append(el('p', { class: 'suave', style: { fontSize: '.82rem', margin: '.6rem 0 0' } }, 'Toca una casilla para un pleno. Toca la orilla entre dos números para un caballo, la esquina entre cuatro para un cuadro y el borde izquierdo de una fila para una calle. ' + V.ventaja));
      cont.replaceChildren(cuerpo, opciones);
      opciones.remove();
      selector = selectorFichas(contFichas, FICHAS);
      pano = crearPano(contPano, ctx.variante, { alApostar: apostar });
      rueda = new Rueda(canvas, ctx.variante, { sonar: ctx.solo });
      reloj = setInterval(pintarReloj, 250);
    },
    actualizar(e) {
      estado = e;
      pintar();
    },
    evento(tipo, d) {
      if (tipo === 'giro') {
        girando = true;
        pano.cerrar(true);
        pano.ganador(null);
        if (estado) pintar();
        rueda.girar(d.resultado, d.duracion).then(() => {
          girando = false;
          if (estado) pintar();
        });
      }
    },
    desmontar() {
      clearInterval(reloj);
      rueda?.destruir();
      pano?.destruir();
    },
  };
}
