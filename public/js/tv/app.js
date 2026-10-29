// Pantalla del anfitrión: abre el casino, muestra el QR, elige la mesa en vivo y la proyecta.
import { io } from '/socket.io/socket.io.esm.min.js';
import { $, $$, el, avisar, confeti, reaccionVuela, hablar, despertarVoz, pantallaEncendida, formatoCodigo, leer, guardar } from '../comun.js';
import { CATALOGO, porClave, dinero } from '../shared/catalogo.js';
import { leerBaraja } from '../almacen.js';
import { sonido, iconoJuego } from '../casino-comun.js';
import * as ruleta from './ruleta.js';
import * as blackjack from './blackjack.js';
import * as videobingo from './videobingo.js';
import * as loteria from './loteria.js';

const VISTAS = { ruleta, blackjack, videobingo, loteria };
const CLAVE_SESION = 'casino:anfitrion';
const socket = io({ transports: ['websocket', 'polling'] });
let sesion = leer(CLAVE_SESION, null);
let casino = null;
let desfase = 0;
let vista = null; // { clave, obj }
let voz = { activa: true, ritmo: 0.95, voz: null, ...leer('loteria:voz', {}) };
const vistosLobby = new Set();
const feedVisto = new Set();
const info = await fetch('/api/info').then((r) => r.json()).catch(() => ({ lan: [], publicUrl: null }));

const pedir = (ev, datos) => new Promise((res) => socket.emit(ev, datos, (r) => res(r || { ok: false })));
const accion = (tipo, datos) => pedir('anfitrion:accion', { tipo, datos });

// ---------- Secciones ----------
function vistaPrincipal(nombre) {
  $('#v-preparar').hidden = nombre !== 'preparar';
  $('#v-casino').hidden = nombre !== 'casino';
}
function seccion(nombre) {
  for (const s of ['lobby', 'mesa', 'podio']) $('#s-' + s).hidden = s !== nombre;
}

// ---------- Abrir casino ----------
function mostrarPreparar() {
  vistaPrincipal('preparar');
  document.body.classList.remove('en-pano');
  $('#lista-juegos').replaceChildren(...CATALOGO.map((j) => el('li', {}, iconoJuego(j.juego), el('div', {}, el('b', {}, j.nombre), el('br'), el('span', { class: 'suave' }, j.resumen)))));
  const previos = leer('casino:ajustesCasino', {});
  if (previos.recargas !== undefined) $$('#form-casino input[name="recargas"]').forEach((i) => (i.checked = i.value === String(previos.recargas)));
  if (previos.juegosLibres !== undefined) $('#form-casino input[name="juegosLibres"]').checked = previos.juegosLibres;
}
function leerAjustesCasino(form) {
  return { recargas: Number(form.querySelector('input[name="recargas"]:checked')?.value ?? 1), juegosLibres: form.querySelector('input[name="juegosLibres"]').checked };
}

$('#btn-abrir').addEventListener('click', async () => {
  const btn = $('#btn-abrir');
  const ajustes = leerAjustesCasino($('#form-casino'));
  guardar('casino:ajustesCasino', ajustes);
  btn.disabled = true;
  btn.textContent = 'Abriendo…';
  despertarVoz();
  sonido.despertar();
  const baraja = await leerBaraja();
  const r = await pedir('anfitrion:crear', { ajustes, baraja });
  btn.disabled = false;
  btn.textContent = 'Abrir casino';
  if (!r.ok) {
    $('#error-abrir').textContent = r.error || 'No se pudo abrir el casino.';
    return;
  }
  sesion = { codigo: r.codigo, token: r.token };
  guardar(CLAVE_SESION, sesion);
  entrarCasino();
});

function entrarCasino() {
  vistaPrincipal('casino');
  pintarUnion();
  if (casino) pintar(casino);
}

function baseUnion() {
  if (info.publicUrl) return info.publicUrl;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
  if (local && info.lan?.length) return info.lan[0];
  return location.origin;
}
function qrSrc() {
  return `/api/qr?d=${encodeURIComponent(`${baseUnion()}/j/${sesion.codigo}`)}`;
}
function pintarUnion() {
  const base = baseUnion();
  $('#qr-grande').src = qrSrc();
  $('#qr-chico').src = qrSrc();
  $('#url-texto').textContent = base.replace(/^https?:\/\//, '');
  $('#codigo-grande').textContent = formatoCodigo(sesion.codigo);
  $('#codigo-mini').textContent = formatoCodigo(sesion.codigo);
  $('#codigo-esquina').textContent = formatoCodigo(sesion.codigo);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  $('#aviso-red').textContent =
    local && !info.publicUrl
      ? info.lan?.length
        ? 'Los celulares deben estar en la misma red WiFi que esta computadora.'
        : 'No encontré una red WiFi en esta computadora: los celulares no podrán entrar. Conéctala a una red o publica la app en internet.'
      : '';
}

// ---------- Pintar ----------
const ordenRanking = (lista) => [...lista].sort((a, b) => b.neto - a.neto || b.saldo - a.saldo);

function filaRanking(j) {
  return el('li', {}, el('span', { class: 'av' }, j.avatar), el('span', { class: 'nom' }, j.nombre), el('span', { class: 'dinero ' + (j.neto > 0 ? 'positivo' : j.neto < 0 ? 'negativo' : '') }, dinero(j.neto, { signo: true })));
}

function pintar(c) {
  desfase = c.ahora - Date.now();
  const mesa = c.mesa;
  const info = mesa ? porClave(`${mesa.juego}:${mesa.variante}`) : null;
  $('#juego-actual').textContent = info ? info.nombre : '';
  $('#btn-reglas').hidden = !mesa;
  document.body.classList.toggle('en-pano', Boolean(mesa) && mesa.juego !== 'loteria');
  pantallaEncendida(Boolean(mesa));
  if (c.fase === 'podio') {
    desmontarVista();
    seccion('podio');
    pintarPodio(c);
  } else if (!mesa) {
    desmontarVista();
    seccion('lobby');
    pintarLobby(c);
  } else {
    seccion('mesa');
    asegurarVista(mesa);
    vista.obj.actualizar(mesa, c);
    pintarLateral(c);
  }
}

function asegurarVista(mesa) {
  const clave = `${mesa.juego}:${mesa.variante}`;
  if (vista?.clave === clave) return;
  desmontarVista();
  const obj = VISTAS[mesa.juego].crear({
    variante: mesa.variante,
    accion,
    desfase: () => desfase,
    hablar: (t, opciones = {}) => voz.activa && hablar(t, { voz: voz.voz, ritmo: voz.ritmo, ...opciones }),
    voz: () => voz,
    avisar,
    codigo: () => sesion.codigo,
    qrSrc,
    casino: () => casino,
    casinoBaraja: async (b) => {
      const r = await pedir('anfitrion:baraja', b);
      if (r.ok) avisar(`Baraja “${b.nombre}” lista en la mesa`, 'bien');
      return r;
    },
  });
  vista = { clave, obj };
  obj.montar($('#escenario'));
  $('#s-mesa').classList.toggle('sin-lateral', Boolean(obj.sinLateral));
  $('#lateral').hidden = Boolean(obj.sinLateral);
}
function desmontarVista() {
  if (!vista) return;
  vista.obj.desmontar?.();
  vista = null;
  $('#escenario').replaceChildren();
}

function pintarLobby(c) {
  const cont = $('#jugadores-lobby');
  cont.replaceChildren();
  if (!c.jugadores.length) cont.append(el('p', { class: 'vacio' }, 'Aquí aparecen los jugadores conforme se registran. Cada uno recibe $1,000 ficticios.'));
  for (const j of ordenRanking(c.jugadores)) {
    const nuevo = !vistosLobby.has(j.id);
    vistosLobby.add(j.id);
    const chip = el(
      'button',
      { type: 'button', class: 'chip-jugador' + (j.conectado ? '' : ' desconectado') + (nuevo ? ' entra' : ''), title: 'Toca para sacar a este jugador' },
      el('span', { class: 'av' }, j.avatar),
      el('span', { class: 'nom' }, j.nombre),
      el('span', { class: 'dinero' }, dinero(j.saldo)),
    );
    chip.addEventListener('click', () => expulsar(j));
    cont.append(chip);
  }
  pintarTiles($('#juegos-lobby'), null);
}

function pintarTiles(cont, actual) {
  cont.replaceChildren(
    ...CATALOGO.map((j) => {
      const b = el('button', { type: 'button', class: 'juego-tile', 'aria-current': String(j.clave === actual) }, iconoJuego(j.juego), el('b', {}, j.nombre), el('span', {}, j.resumen));
      b.addEventListener('click', () => abrirJuego(j.clave));
      return b;
    }),
  );
}

function pintarLateral(c) {
  $('#ranking-lateral').replaceChildren(...ordenRanking(c.jugadores).slice(0, 7).map(filaRanking));
  const feed = $('#feed');
  feed.replaceChildren(
    ...(c.feed.length
      ? c.feed.slice(0, 6).map((f) => {
          const li = el('li', { class: feedVisto.has(f.id) ? '' : 'nuevo' }, `${f.avatar} ${f.nombre} ganó `, el('b', {}, dinero(f.neto)), ` en ${f.juego}`);
          feedVisto.add(f.id);
          return li;
        })
      : [el('li', { class: 'suave' }, 'Las ganancias de $100 o más aparecen aquí.')]),
  );
}

function pintarPodio(c) {
  const orden = ordenRanking(c.jugadores);
  const lugares = [orden[1], orden[0], orden[2]];
  const clases = ['l2', 'l1', 'l3'];
  const numeros = ['2', '1', '3'];
  $('#podio').replaceChildren(
    ...lugares.map((j, i) =>
      j
        ? el('div', { class: 'lugar ' + clases[i] }, el('span', { class: 'av' }, j.avatar), el('span', { class: 'nom' }, j.nombre), el('span', { class: 'dinero ' + (j.neto >= 0 ? 'positivo' : 'negativo') }, dinero(j.neto, { signo: true })), el('div', { class: 'bloque' }, numeros[i]))
        : el('div'),
    ),
  );
  $('#ranking-podio').replaceChildren(...orden.map(filaRanking));
}

// ---------- Acciones ----------
async function expulsar(j) {
  if (!confirm(`¿Sacar a ${j.nombre} del casino?`)) return;
  await pedir('anfitrion:expulsar', { id: j.id });
}

async function abrirJuego(clave) {
  const info = porClave(clave);
  const mesa = casino?.mesa;
  if (mesa && `${mesa.juego}:${mesa.variante}` === clave) {
    $('#dlg-juegos').open && $('#dlg-juegos').close();
    return;
  }
  despertarVoz();
  sonido.despertar();
  if (info.juego === 'loteria') {
    const r = await pedir('anfitrion:baraja', await leerBaraja());
    if (!r.ok && r.error) avisar(r.error, 'error');
  }
  const ajustes = leer('casino:mesa:' + info.juego, {});
  const r = await pedir('anfitrion:mesa', { clave, ajustes });
  if (!r.ok) return avisar(r.error || 'No se pudo abrir la mesa.', 'error');
  if ($('#dlg-juegos').open) $('#dlg-juegos').close();
}

$('#btn-juegos').addEventListener('click', () => {
  const mesa = casino?.mesa;
  $('#nota-juegos').textContent = mesa ? 'Si cambias de juego, la ronda en curso se cancela y a todos se les devuelven sus fichas.' : 'Elige el juego que se verá en la tele.';
  $('#btn-cerrar-mesa').hidden = !mesa;
  pintarTiles($('#juegos-dlg'), mesa ? `${mesa.juego}:${mesa.variante}` : null);
  $('#dlg-juegos').showModal();
});
$('#btn-cerrar-mesa').addEventListener('click', async () => {
  await pedir('anfitrion:cerrarMesa');
  $('#dlg-juegos').close();
});

let leerReglas = null;
$('#btn-reglas').addEventListener('click', () => {
  if (!vista?.obj.formReglas || !casino?.mesa) return;
  $('#nota-reglas').textContent = vista.obj.notaReglas?.(casino.mesa) || '';
  leerReglas = vista.obj.formReglas($('#form-reglas'), casino.mesa.ajustes);
  $('#dlg-reglas').showModal();
});
$('#dlg-reglas').addEventListener('close', async () => {
  if ($('#dlg-reglas').returnValue !== 'ok' || !leerReglas || !casino?.mesa) return;
  const { ajustes, voz: v } = leerReglas();
  if (v) {
    voz = { ...voz, ...v };
    guardar('loteria:voz', voz);
  }
  const juego = casino.mesa.juego;
  guardar('casino:mesa:' + juego, { ...leer('casino:mesa:' + juego, {}), ...ajustes });
  const r = await accion('ajustes', ajustes);
  if (!r.ok) return avisar(r.error || 'No se guardaron las reglas.', 'error');
  avisar('Reglas guardadas', 'bien');
});

$('#btn-ranking').addEventListener('click', () => {
  $('#ranking-dlg').replaceChildren(...ordenRanking(casino?.jugadores || []).map(filaRanking));
  $('#dlg-ranking').showModal();
});

$('#btn-menu-casino').addEventListener('click', () => {
  const a = casino?.ajustes || {};
  const cont = $('#form-casino-dlg');
  cont.replaceChildren(
    el(
      'fieldset',
      { class: 'grupo' },
      el('legend', {}, 'Recargas cuando alguien se queda sin saldo'),
      el(
        'div',
        { class: 'opciones' },
        ...[
          [0, 'Ninguna'],
          [1, '1 recarga'],
          [3, '3 recargas'],
          [99, 'Sin límite'],
        ].map(([v, t]) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'recargas', value: String(v), checked: a.recargas === v }), el('span', {}, t))),
      ),
    ),
    el('label', { class: 'interruptor' }, el('input', { type: 'checkbox', name: 'juegosLibres', checked: a.juegosLibres }), 'Permitir juegos individuales en el celular'),
  );
  $('#dlg-casino').showModal();
});
$('#dlg-casino').addEventListener('close', async () => {
  if ($('#dlg-casino').returnValue !== 'ok') return;
  const ajustes = leerAjustesCasino($('#form-casino-dlg'));
  guardar('casino:ajustesCasino', ajustes);
  const r = await pedir('anfitrion:ajustes', ajustes);
  if (r.ok) avisar('Ajustes del casino guardados', 'bien');
});
$('#btn-podio').addEventListener('click', async () => {
  if (!confirm('¿Terminar y mostrar el podio? La mesa actual se cierra y se devuelven las fichas en juego.')) return;
  $('#dlg-casino').close();
  await pedir('anfitrion:podio', { mostrar: true });
  confeti(160);
  sonido.grande();
});
$('#btn-volver').addEventListener('click', () => pedir('anfitrion:podio', { mostrar: false }));
$('#btn-cerrar').addEventListener('click', async () => {
  if (!confirm('¿Cerrar el casino? Todos los jugadores saldrán y se pierden los saldos.')) return;
  $('#dlg-casino').close();
  await pedir('anfitrion:cerrar');
  localStorage.removeItem(CLAVE_SESION);
  sesion = null;
  casino = null;
  desmontarVista();
  mostrarPreparar();
});

$('#btn-voz').addEventListener('click', () => {
  voz.activa = !voz.activa;
  guardar('loteria:voz', voz);
  pintarBotonVoz();
  if (!voz.activa) speechSynthesis?.cancel();
});
function pintarBotonVoz() {
  $('#btn-voz').textContent = voz.activa ? 'Voz: sí' : 'Voz: no';
  $('#btn-voz').setAttribute('aria-pressed', String(voz.activa));
}
$('#btn-completa').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));

document.addEventListener('keydown', (ev) => {
  if (document.querySelector('dialog[open]') || ev.target.closest('input, textarea, select')) return;
  if (ev.key.toLowerCase() === 'f') return $('#btn-completa').click();
  vista?.obj.tecla?.(ev);
});

// ---------- Socket ----------
socket.on('connect', async () => {
  if (!sesion) return;
  const r = await pedir('anfitrion:reanudar', sesion);
  if (!r.ok) {
    localStorage.removeItem(CLAVE_SESION);
    sesion = null;
    avisar('El casino anterior ya no existe. Abre uno nuevo.', '', 4000);
    mostrarPreparar();
  } else if ($('#v-casino').hidden) entrarCasino();
});
socket.on('disconnect', () => avisar('Se perdió la conexión. Reconectando…', 'error', 2500));
socket.on('casino', (c) => {
  const antes = casino;
  casino = c;
  if (sesion && !$('#v-casino').hidden) pintar(c);
  if (antes && antes.fase !== 'podio' && c.fase === 'podio') confeti(160);
});
socket.on('ev', (m) => {
  if (m.solo || !vista) return;
  if (vista.clave.split(':')[0] !== m.juego) return;
  vista.obj.evento?.(m.tipo, m.datos);
});
socket.on('ganancia', (g) => {
  avisar(`${g.avatar} ${g.nombre} ganó ${dinero(g.neto)} en ${g.juego}`, 'bien', 4200);
  if (g.neto >= 50000) sonido.grande();
});
socket.on('reaccion', ({ emoji, nombre, avatar }) => reaccionVuela(emoji, `${avatar} ${nombre}`));

pintarBotonVoz();
if (!sesion) mostrarPreparar();
