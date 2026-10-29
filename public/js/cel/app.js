// Pantalla del jugador: registro demo, saldo, mesa en vivo, juegos individuales y cuenta.
import { io } from '/socket.io/socket.io.esm.min.js';
import { $, $$, el, avisar, confeti, despertarVoz, pantallaEncendida, formatoCodigo, leer, guardar } from '../comun.js';
import { CATALOGO, porClave, AVATARES, dinero, RECARGA_UMBRAL } from '../shared/catalogo.js';
import { animarDinero, sonido, iconoJuego } from '../casino-comun.js';
import * as ruleta from './ruleta.js';
import * as blackjack from './blackjack.js';
import * as videobingo from './videobingo.js';
import * as loteria from './loteria.js';

const VISTAS = { ruleta, blackjack, videobingo, loteria };
const REACCIONES = ['👏', '🔥', '😱', '😂', '🙏', '💃', '🤑', '😭'];
const params = new URLSearchParams(location.search);
let codigo = (params.get('c') || '').replace(/\D/g, '').slice(0, 6);
const claveSesion = () => `casino:jugador:${codigo}`;

let sesion = codigo ? leer(claveSesion(), null) : null;
let casino = null;
let yo = null;
let desfase = 0;
let tab = 'vivo';
let soloAbierto = null;
let vistaVivo = null;
let vistaSolo = null;
let salida = null;
let ultimaMesa = null;
let prefs = { vibrar: true, ...leer('casino:prefs', {}) };

const socket = io({ transports: ['websocket', 'polling'], autoConnect: false });
const pedir = (ev, datos) => new Promise((res) => socket.emit(ev, datos, (r) => res(r || { ok: false })));
const vibrar = (p) => prefs.vibrar && navigator.vibrate?.(p);

// ---------- Pantallas ----------
function mostrar(nombre) {
  for (const s of ['unirse', 'cargando', 'salida', 'app']) $('#s-' + s).hidden = s !== nombre;
}

// ---------- Registro ----------
function prepararUnirse(error) {
  mostrar('unirse');
  $('#campo-codigo').hidden = Boolean(codigo);
  $('#in-codigo').value = formatoCodigo(codigo);
  $('#in-nombre').value = leer('casino:nombre', leer('loteria:nombre', ''));
  const elegido = leer('casino:avatar', AVATARES[Math.floor(Math.random() * AVATARES.length)]);
  $('#avatares').replaceChildren(...AVATARES.map((a) => el('label', {}, el('input', { type: 'radio', name: 'avatar', value: a, checked: a === elegido, 'aria-label': `Avatar ${a}` }), el('span', {}, a))));
  $('#error-unirse').textContent = error || '';
}
$('#in-codigo').addEventListener('input', (e) => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 6);
  e.target.value = d.length > 3 ? d.slice(0, 3) + ' ' + d.slice(3) : d;
});
$('#form-unirse').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const c = codigo || $('#in-codigo').value.replace(/\D/g, '');
  const nombre = $('#in-nombre').value.trim();
  const avatar = $('input[name="avatar"]:checked')?.value;
  if (c.length !== 6) return ($('#error-unirse').textContent = 'El código tiene 6 números.');
  if (!nombre) return ($('#error-unirse').textContent = 'Escribe tu nombre.');
  codigo = c;
  guardar('casino:nombre', nombre);
  guardar('casino:avatar', avatar);
  despertarVoz();
  sonido.despertar();
  $('#btn-entrar').disabled = true;
  await unirse({ nombre, avatar });
  $('#btn-entrar').disabled = false;
});

async function unirse({ nombre, avatar, token } = {}) {
  if (!socket.connected) socket.connect();
  await new Promise((res) => (socket.connected ? res() : socket.once('connect', res)));
  const r = await pedir('jugador:unirse', { codigo, nombre, avatar, token });
  if (!r.ok) {
    if (token) localStorage.removeItem(claveSesion());
    sesion = null;
    prepararUnirse(r.error);
    return false;
  }
  sesion = { token: r.token, id: r.id };
  guardar(claveSesion(), sesion);
  if (!params.get('c')) history.replaceState(null, '', '/jugar?c=' + codigo);
  if (!r.reconectado) setTimeout(() => avisar('¡Bienvenido! Tienes $1,000 ficticios para jugar.', 'bien', 4000), 300);
  return true;
}
socket.on('connect', () => {
  if (sesion && yo) unirse({ token: sesion.token });
});
socket.on('disconnect', () => {
  if (!salida) avisar('Sin conexión. Reconectando…', 'error', 2500);
});

// ---------- Contexto para las vistas de juego ----------
function contexto({ solo, clave, variante }) {
  return {
    solo,
    clave,
    variante,
    accion: (tipo, datos) => (solo ? pedir('jugador:solo', { clave, tipo, datos }) : pedir('jugador:mesa', { tipo, datos })),
    desfase: () => desfase,
    avisar,
    vibrar,
    confeti,
    yo: () => yo,
    casino: () => casino,
    codigo: () => codigo,
  };
}

// ---------- Render ----------
function render() {
  if (salida) return mostrar('salida');
  if (!yo || !casino) return mostrar('cargando');
  mostrar('app');
  $('#yo-av').textContent = yo.avatar;
  $('#yo-nombre').textContent = yo.nombre;
  animarDinero($('#saldo'), yo.saldo);
  $$('.nav-cel button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  for (const t of ['vivo', 'juegos', 'cuenta']) $('#t-' + t).hidden = t !== tab;
  renderVivo();
  renderJuegos();
  if (tab === 'cuenta') renderCuenta();
  const enPano = (tab === 'vivo' && casino.mesa && casino.mesa.juego !== 'loteria') || (tab === 'juegos' && soloAbierto);
  document.body.classList.toggle('en-pano', Boolean(enPano));
  pantallaEncendida(Boolean(casino.mesa) && tab === 'vivo');
}

function claveMesa(m) {
  return m ? `${m.juego}:${m.variante}` : null;
}

function renderVivo() {
  const cont = $('#t-vivo');
  const m = casino.mesa;
  const clave = claveMesa(m);
  $('.nav-cel .punto').hidden = !(clave && clave !== ultimaMesa && tab !== 'vivo');
  if (tab === 'vivo') ultimaMesa = clave;
  if (casino.fase === 'podio') {
    desmontar('vivo');
    return pintarPodio(cont);
  }
  if (!m) {
    desmontar('vivo');
    return pintarEspera(cont);
  }
  if (vistaVivo?.clave !== clave) {
    desmontar('vivo');
    const host = el('div');
    const obj = VISTAS[m.juego].crear(contexto({ solo: false, clave, variante: m.variante }));
    cont.replaceChildren(host, reaccionesEl());
    obj.montar(host);
    vistaVivo = { clave, obj };
  }
  // Se espera a que llegue también el estado privado de esta misma mesa
  if (!yo.mesa || yo.mesa.juego !== m.juego || yo.mesa.variante !== m.variante) return;
  vistaVivo.obj.actualizar({ ...m, ...yo.mesa }, yo, casino);
}

function desmontar(cual) {
  if (cual === 'vivo' && vistaVivo) {
    vistaVivo.obj.desmontar?.();
    vistaVivo = null;
  }
  if (cual === 'solo' && vistaSolo) {
    vistaSolo.obj.desmontar?.();
    vistaSolo = null;
  }
}

function reaccionesEl() {
  return el(
    'div',
    { class: 'tarjeta', style: { marginTop: '.8rem' } },
    el('div', { class: 'suave', style: { fontSize: '.85rem', marginBottom: '.2rem' } }, 'Manda una reacción a la tele'),
    el(
      'div',
      { class: 'reacciones' },
      ...REACCIONES.map((emoji) => {
        const b = el('button', { type: 'button', 'aria-label': `Enviar ${emoji}` }, emoji);
        b.addEventListener('click', () => pedir('jugador:reaccion', { emoji }));
        return b;
      }),
    ),
  );
}

const ordenRanking = () => [...casino.jugadores].sort((a, b) => b.neto - a.neto || b.saldo - a.saldo);

function pintarEspera(cont) {
  const orden = ordenRanking();
  const pos = orden.findIndex((j) => j.id === yo.id) + 1;
  cont.replaceChildren(
    el(
      'div',
      { class: 'tarjeta' },
      el('h2', {}, 'Esperando la mesa en vivo'),
      el('p', { class: 'suave' }, 'El anfitrión está eligiendo el juego que se verá en la tele.'),
      casino.ajustes.juegosLibres ? el('button', { class: 'btn btn-cempa', type: 'button', onclick: () => irA('juegos') }, 'Mientras, juega por tu cuenta') : null,
    ),
    el('div', { class: 'tarjeta' }, el('h3', {}, pos ? `Vas en el lugar ${pos} de ${orden.length}` : 'Ranking'), el('ol', { class: 'ranking' }, ...orden.slice(0, 6).map(filaRanking))),
    reaccionesEl(),
  );
}

function filaRanking(j) {
  return el('li', { style: j.id === yo.id ? { outline: '2px solid var(--oro)' } : {} }, el('span', {}, j.avatar), el('span', { class: 'nom' }, j.nombre), el('span', { class: 'dinero ' + (j.neto > 0 ? 'positivo' : j.neto < 0 ? 'negativo' : '') }, dinero(j.neto, { signo: true })));
}

function pintarPodio(cont) {
  const orden = ordenRanking();
  const pos = orden.findIndex((j) => j.id === yo.id) + 1;
  const lugares = [orden[1], orden[0], orden[2]];
  cont.replaceChildren(
    el(
      'div',
      { class: 'vista-podio-cel' },
      el('h2', {}, pos === 1 ? '¡Ganaste la noche!' : `Quedaste en el lugar ${pos}`),
      el('p', { class: 'suave' }, `Ganancia neta: ${dinero(yo.neto, { signo: true })}`),
      el('div', { class: 'podio' }, ...lugares.map((j, i) => (j ? el('div', { class: 'lugar ' + ['l2', 'l1', 'l3'][i] }, el('span', { class: 'av' }, j.avatar), el('span', { class: 'nom' }, j.nombre), el('div', { class: 'bloque' }, ['2', '1', '3'][i])) : el('div')))),
      el('div', { class: 'tarjeta', style: { marginTop: '1rem', textAlign: 'left' } }, el('ol', { class: 'ranking' }, ...orden.map(filaRanking))),
    ),
  );
}

// ---------- Juegos individuales ----------
function renderJuegos() {
  const cont = $('#t-juegos');
  if (!casino.ajustes.juegosLibres) {
    desmontar('solo');
    soloAbierto = null;
    cont.replaceChildren(el('div', { class: 'tarjeta' }, el('h2', {}, 'Juegos individuales apagados'), el('p', { class: 'suave' }, 'El anfitrión quiere que todos jueguen en la mesa en vivo.')));
    return;
  }
  if (soloAbierto) {
    const info = porClave(soloAbierto);
    const estado = yo.solos?.[soloAbierto];
    if (vistaSolo?.clave !== soloAbierto) {
      desmontar('solo');
      const host = el('div');
      const atras = el('button', { class: 'btn btn-chico btn-fantasma', type: 'button', 'aria-label': 'Volver a la lista de juegos' }, '‹ Juegos');
      atras.addEventListener('click', () => {
        soloAbierto = null;
        desmontar('solo');
        render();
      });
      cont.replaceChildren(el('div', { class: 'volver' }, atras, el('h2', {}, info.nombre)), host);
      const obj = VISTAS[info.juego].crear(contexto({ solo: true, clave: soloAbierto, variante: info.variante }));
      obj.montar(host);
      vistaSolo = { clave: soloAbierto, obj };
    }
    if (estado) vistaSolo.obj.actualizar({ juego: info.juego, ...estado }, yo, casino);
    return;
  }
  desmontar('solo');
  cont.replaceChildren(
    el('div', { class: 'tarjeta' }, el('h2', {}, 'Juega por tu cuenta'), el('p', { class: 'suave', style: { margin: 0 } }, 'Usan el mismo saldo que la mesa en vivo. Tus fichas se quedan donde las dejaste si regresas.')),
    el(
      'div',
      { class: 'lista-solos' },
      ...CATALOGO.filter((j) => j.solo).map((j) => {
        const b = el('button', { type: 'button', class: 'juego-tile' }, iconoJuego(j.juego), el('b', {}, j.nombre), el('span', {}, j.resumen));
        b.addEventListener('click', async () => {
          sonido.despertar();
          const r = await pedir('jugador:solo', { clave: j.clave, tipo: 'abrir' });
          if (!r.ok) return avisar(r.error || 'No se pudo abrir el juego.', 'error');
          soloAbierto = j.clave;
          render();
          scrollTo(0, 0);
        });
        return b;
      }),
    ),
  );
}

// ---------- Cuenta ----------
function renderCuenta() {
  const orden = ordenRanking();
  const pos = orden.findIndex((j) => j.id === yo.id) + 1;
  const recargar = el('button', { class: 'btn btn-cempa', type: 'button', disabled: !yo.puedeRecargar }, 'Recargar $1,000 ficticios');
  recargar.addEventListener('click', async () => {
    const r = await pedir('jugador:recargar');
    if (!r.ok) return avisar(r.error, 'error');
    avisar('Listo: tienes $1,000 ficticios más.', 'bien');
    sonido.gana();
  });
  const nota = yo.recargasRestantes <= 0 ? 'El anfitrión no permite más recargas.' : yo.saldo >= RECARGA_UMBRAL ? `Puedes recargar cuando tu saldo baje de ${dinero(RECARGA_UMBRAL)}. ${yo.recargasRestantes >= 99 ? 'Tienes recargas ilimitadas' : yo.recargasRestantes === 1 ? 'Te queda 1 recarga' : `Te quedan ${yo.recargasRestantes} recargas`}.` : '';
  const hora = (t) => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const op = (texto, valor, fn) => {
    const i = el('input', { type: 'checkbox', checked: valor });
    i.addEventListener('change', () => fn(i.checked));
    return el('label', { class: 'interruptor' }, i, texto);
  };
  const salir = el('button', { class: 'btn btn-fantasma', type: 'button' }, 'Salir del casino');
  salir.addEventListener('click', async () => {
    if (!confirm('¿Salir del casino? Perderás tu saldo ficticio.')) return;
    await pedir('jugador:salir');
    localStorage.removeItem(claveSesion());
    salirCon('Saliste del casino', 'Gracias por jugar.');
  });
  $('#t-cuenta').replaceChildren(
    el(
      'div',
      { class: 'tarjeta' },
      el('div', { class: 'suave' }, 'Saldo ficticio'),
      el('div', { class: 'cifra-cel' }, dinero(yo.saldo)),
      el('p', { style: { margin: '.4rem 0 .6rem' } }, 'Ganancia neta ', el('b', { class: yo.neto > 0 ? 'positivo' : yo.neto < 0 ? 'negativo' : '' }, dinero(yo.neto, { signo: true })), pos ? ` · lugar ${pos} de ${orden.length}` : ''),
      recargar,
      nota ? el('p', { class: 'suave', style: { margin: '.5rem 0 0', fontSize: '.88rem' } }, nota) : null,
    ),
    el(
      'div',
      { class: 'tarjeta' },
      el('h3', {}, 'Movimientos'),
      el(
        'ul',
        { class: 'movimientos' },
        ...yo.movimientos.map((m) => el('li', {}, el('span', { class: 'concepto' }, m.concepto), el('span', { class: 'dinero ' + (m.neto > 0 ? 'positivo' : m.neto < 0 ? 'negativo' : '') }, m.recarga ? dinero(m.neto) : dinero(m.neto, { signo: true })), el('span', { class: 'hora' }, hora(m.t)), el('span', { class: 'saldo-tras' }, `Saldo ${dinero(m.saldo)}`))),
      ),
    ),
    el('div', { class: 'tarjeta' }, el('h3', {}, 'Opciones'), op('Sonidos', !sonido.silencio, (v) => (sonido.silencio = !v)), op('Vibrar al ganar', prefs.vibrar, (v) => guardar('casino:prefs', (prefs = { ...prefs, vibrar: v }))), salir),
    el('p', { class: 'suave', style: { fontSize: '.82rem', textAlign: 'center' } }, 'Modo demo: el dinero es ficticio, no se puede depositar ni retirar y no tiene valor real.'),
  );
}

function irA(t) {
  tab = t;
  render();
  scrollTo(0, 0);
}
$$('.nav-cel button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.tab)));

function salirCon(titulo, texto) {
  salida = { titulo, texto };
  $('#salida-titulo').textContent = titulo;
  $('#salida-texto').textContent = texto;
  socket.disconnect();
  pantallaEncendida(false);
  desmontar('vivo');
  desmontar('solo');
  mostrar('salida');
}

// ---------- Eventos del servidor ----------
socket.on('casino', (c) => {
  desfase = c.ahora - Date.now();
  const antes = casino;
  casino = c;
  if (antes && antes.fase !== 'podio' && c.fase === 'podio') {
    tab = 'vivo';
    confeti(120);
  }
  render();
});
socket.on('yo', (y) => {
  const antes = yo;
  yo = y;
  if (antes && y.saldo > antes.saldo + 5000) vibrar([60, 40, 120]);
  render();
});
socket.on('ev', (m) => {
  if (m.solo) {
    if (vistaSolo && vistaSolo.clave.split(':')[0] === m.juego) vistaSolo.obj.evento?.(m.tipo, m.datos);
  } else if (vistaVivo && vistaVivo.clave.split(':')[0] === m.juego) vistaVivo.obj.evento?.(m.tipo, m.datos);
});
socket.on('aviso', (t) => avisar(t, '', 5000));
socket.on('expulsado', () => {
  localStorage.removeItem(claveSesion());
  salirCon('El anfitrión te sacó del casino', 'Si fue un error, pídele el código y vuelve a entrar.');
});
socket.on('cerrada', () => {
  localStorage.removeItem(claveSesion());
  salirCon('El casino se cerró', 'El anfitrión terminó la sesión. ¡Gracias por jugar!');
});

// Altura real de la cabecera para que lo pegajoso quede justo debajo
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--alto-cab', Math.round(e.target.getBoundingClientRect().height) + 'px')).observe($('.cab-cel'));

// ---------- Arranque ----------
(async () => {
  if (codigo && sesion?.token) {
    mostrar('cargando');
    await unirse({ token: sesion.token });
  } else if (codigo) {
    const r = await fetch('/api/sala/' + codigo).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r.ok) {
      codigo = '';
      prepararUnirse(r.error || 'No existe una sala con ese código.');
    } else prepararUnirse();
  } else prepararUnirse();
})();
