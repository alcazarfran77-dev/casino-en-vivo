// Ruleta en la tele: rueda grande, reloj de apuestas, historial y ganadores.
import { el } from '../comun.js';
import { Rueda } from '../componentes/rueda.js';
import { historialEl } from '../componentes/pano.js';
import { VARIANTES, etiqueta, colorDe, esCero, ROJOS } from '../shared/ruleta.js';
import { dinero, segundosHasta, sonido } from '../casino-comun.js';

const TIEMPOS = [
  [0, 'El anfitrión gira'],
  [10, '10 s'],
  [15, '15 s'],
  [20, '20 s'],
  [30, '30 s'],
  [45, '45 s'],
];

export function describir(n) {
  if (esCero(n)) return 'verde';
  const partes = [ROJOS.has(n) ? 'rojo' : 'negro', n % 2 ? 'impar' : 'par', n <= 18 ? '1 a 18' : '19 a 36'];
  return partes.join(', ');
}
export const decirNumero = (n) => (n === 37 ? 'doble cero' : n === 0 ? 'cero' : `${n}, ${ROJOS.has(n) ? 'rojo' : 'negro'}`);

export function crear(ctx) {
  const V = VARIANTES[ctx.variante];
  let rueda = null;
  let estado = null;
  let reloj = null;
  let girando = false;
  const r = {};

  function pintar() {
    const e = estado;
    if (!e || !r.fase) return;
    const seg = segundosHasta(e.cierreEn, ctx.desfase());
    if (e.fase === 'apuestas') {
      r.fase.textContent = e.mesa.total ? 'Hagan sus apuestas' : 'Esperando apuestas';
      r.reloj.textContent = seg !== null ? String(seg) : '';
      r.btnGirar.hidden = false;
    } else if (e.fase === 'girando') {
      r.fase.textContent = 'No va más';
      r.reloj.textContent = '';
      r.btnGirar.hidden = true;
    } else {
      r.fase.textContent = e.resultado !== null ? `Salió el ${etiqueta(e.resultado)}` : 'Resultado';
      r.reloj.textContent = '';
      r.btnGirar.hidden = true;
    }
    r.ayuda.textContent = e.fase === 'apuestas' ? (e.ajustes.tiempo ? 'Se gira solo al terminar el reloj. Barra espaciadora para girar antes.' : 'Gira cuando todos hayan apostado. Barra espaciadora para girar.') : '';
  }

  function pintarTodo() {
    const e = estado;
    pintar();
    // Resultado
    const mostrar = e.fase === 'pagos' && e.resultado !== null;
    r.numero.replaceChildren();
    if (mostrar) {
      const n = el('span', { class: 'numero-grande ' + colorDe(e.resultado) }, etiqueta(e.resultado));
      r.numero.append(n);
      r.desc.textContent = describir(e.resultado);
    } else if (e.historial.length) {
      r.numero.append(el('span', { class: 'numero-grande ' + colorDe(e.historial[0]) }, etiqueta(e.historial[0])));
      r.desc.textContent = 'Último número';
    } else {
      r.desc.textContent = 'Todavía no sale ningún número.';
    }
    r.historial.replaceChildren(historialEl(e.historial, 16));
    // Mesa o ganadores
    if (e.fase === 'pagos') {
      r.tituloMesa.textContent = e.ganadores.length ? 'Ganadores de la ronda' : 'Esta vez ganó la casa';
      r.total.textContent = e.ganadores.length ? dinero(e.ganadores.reduce((s, g) => s + g.neto, 0)) : '';
      r.lista.replaceChildren(...e.ganadores.slice(0, 8).map((g) => el('li', {}, el('span', {}, g.avatar), el('span', { class: 'nom' }, g.nombre), el('span', { class: 'dinero positivo' }, dinero(g.neto, { signo: true })))));
    } else {
      r.tituloMesa.textContent = e.mesa.jugadores ? `En la mesa: ${e.mesa.jugadores} ${e.mesa.jugadores === 1 ? 'jugador' : 'jugadores'}` : 'Nadie ha apostado';
      r.total.textContent = dinero(e.mesa.total);
      r.lista.replaceChildren(...e.mesa.porJugador.slice(0, 8).map((p) => el('li', {}, el('span', {}, p.avatar), el('span', { class: 'nom' }, p.nombre), el('span', { class: 'dinero' }, dinero(p.total)))));
    }
    // Estadísticas de los últimos números
    const h = e.historial.slice(0, 60);
    const rojos = h.filter((n) => ROJOS.has(n)).length;
    const ceros = h.filter(esCero).length;
    const negros = h.length - rojos - ceros;
    const pct = (x) => (h.length ? Math.round((x / h.length) * 100) + ' %' : '–');
    const conteo = new Map();
    h.forEach((n) => conteo.set(n, (conteo.get(n) || 0) + 1));
    const calientes = [...conteo].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => etiqueta(n));
    r.stats.replaceChildren(
      el('div', {}, 'Rojo', el('b', {}, pct(rojos))),
      el('div', {}, 'Negro', el('b', {}, pct(negros))),
      el('div', {}, V.ceros.length > 1 ? 'Ceros' : 'Cero', el('b', {}, String(ceros))),
    );
    r.calientes.textContent = calientes.length ? `Más frecuentes en los últimos ${h.length}: ${calientes.join(', ')}` : '';
    if (!girando && e.fase !== 'girando' && e.resultado !== null && e.fase === 'pagos') rueda.mostrar(e.resultado);
  }

  return {
    montar(cont) {
      const canvas = el('canvas', { 'aria-label': `Rueda de ${V.nombre}` });
      r.fase = el('p', { class: 'fase-grande' });
      r.reloj = el('span', { class: 'reloj-grande', 'aria-live': 'off' });
      r.btnGirar = el('button', { class: 'btn btn-cempa', type: 'button' }, 'Cerrar apuestas y girar');
      r.btnGirar.addEventListener('click', () => ctx.accion('girar'));
      r.ayuda = el('p', { class: 'suave', style: { margin: '.5rem 0 0' } });
      r.numero = el('div');
      r.desc = el('div', { class: 'suave' });
      r.historial = el('div', { style: { marginTop: '.7rem' } });
      r.tituloMesa = el('h3');
      r.total = el('div', { class: 'cifra' });
      r.lista = el('ul', { class: 'lista-apostadores', style: { marginTop: '.6rem' } });
      r.stats = el('div', { class: 'estadisticas' });
      r.calientes = el('p', { class: 'suave', style: { margin: '.5rem 0 0', fontSize: '.9rem' } });
      const raiz = el(
        'div',
        { class: 'tv-ruleta' },
        el('div', { class: 'rueda' }, canvas),
        el(
          'div',
          { class: 'info' },
          el('div', { class: 'panel' }, el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' } }, r.fase, r.reloj), el('div', { class: 'controles-mesa', style: { marginTop: '.6rem' } }, r.btnGirar), r.ayuda),
          el('div', { class: 'panel' }, el('div', { class: 'resultado-fila' }, r.numero, el('div', {}, r.desc)), r.historial),
          el('div', { class: 'panel' }, el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' } }, r.tituloMesa, r.total), r.lista),
          el('div', { class: 'panel' }, r.stats, r.calientes),
          el('p', { class: 'suave', style: { margin: 0, fontSize: '.92rem' } }, `${V.resumen} ${V.ventaja}`),
        ),
      );
      cont.replaceChildren(raiz);
      rueda = new Rueda(canvas, ctx.variante);
      reloj = setInterval(pintar, 250);
    },
    actualizar(m) {
      estado = m;
      pintarTodo();
    },
    evento(tipo, d) {
      if (tipo === 'giro') {
        girando = true;
        rueda.girar(d.resultado, d.duracion).then(() => {
          girando = false;
          ctx.hablar(decirNumero(d.resultado));
        });
      } else if (tipo === 'resultado') {
        if (d.ganadores?.length) sonido.gana();
      }
    },
    tecla(ev) {
      if (ev.key === ' ' && estado?.fase === 'apuestas') {
        ev.preventDefault();
        ctx.accion('girar');
      }
    },
    notaReglas: () => 'El cambio de tiempo empieza a contar desde la ronda abierta.',
    formReglas(cont, a) {
      cont.replaceChildren(
        el(
          'fieldset',
          { class: 'grupo' },
          el('legend', {}, 'Tiempo para apostar'),
          el('div', { class: 'opciones' }, ...TIEMPOS.map(([v, t]) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'tiempo', value: String(v), checked: a.tiempo === v }), el('span', {}, t)))),
          el('small', {}, 'Con “El anfitrión gira”, las apuestas siguen abiertas hasta que presionas Girar.'),
        ),
      );
      return () => ({ ajustes: { tiempo: Number(cont.querySelector('input[name="tiempo"]:checked').value) } });
    },
    desmontar() {
      clearInterval(reloj);
      rueda?.destruir();
    },
  };
}
