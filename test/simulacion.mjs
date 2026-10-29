// Simulación de partidas completas contra el servidor real, con resultados forzados
// para comprobar cada pago al centavo. Uso: npm test
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { premioTotal } from '../public/js/shared/videobingo.js';
import { claveDe } from '../public/js/shared/ruleta.js';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const paso = (m) => {
  ok++;
  console.log('  ✔ ' + m);
};

const srv = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), CASINO_PRUEBAS: '1', CASINO_ESCALA_TIEMPO: '0.02' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((res) => srv.stdout.on('data', (d) => String(d).includes('listo') && res()));

function cliente() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.casino = null;
  s.yo = null;
  s.eventos = [];
  s.on('casino', (e) => (s.casino = e));
  s.on('yo', (y) => (s.yo = y));
  for (const ev of ['ev', 'aviso', 'ganancia', 'reaccion', 'expulsado']) s.on(ev, (d) => s.eventos.push([ev, d]));
  s.pedir = (ev, datos) => new Promise((res) => s.emit(ev, datos, res));
  s.mesa = (tipo, datos) => s.pedir('jugador:mesa', { tipo, datos });
  s.solo = (clave, tipo, datos) => s.pedir('jugador:solo', { clave, tipo, datos });
  return s;
}
const hasta = async (cond, ms = 8000, msg = 'condición') => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('Tiempo agotado esperando: ' + msg);
    await espera(10);
  }
};
const saldo = (c) => c.yo.saldo;
const quieto = async (c, ms = 120) => {
  // espera a que llegue el estado más reciente
  await espera(ms);
};

try {
  console.log('\nSimulación del casino\n');
  const host = cliente();
  const r = await host.pedir('anfitrion:crear', { ajustes: { recargas: 1, juegosLibres: true } });
  assert.ok(r.ok);
  assert.match(r.codigo, /^\d{6}$/);
  const codigo = r.codigo;
  const qr = await fetch(`${URL}/api/qr?d=${encodeURIComponent(URL + '/j/' + codigo)}`);
  assert.ok((await qr.text()).startsWith('<svg'));
  assert.equal((await fetch(`${URL}/j/${codigo}`, { redirect: 'manual' })).headers.get('location'), `/jugar?c=${codigo}`);
  paso(`Casino abierto con código ${codigo}, QR y enlace corto`);

  // ---------- Registro ----------
  const ana = cliente();
  const beto = cliente();
  const caro = cliente();
  const ra = await ana.pedir('jugador:unirse', { codigo, nombre: 'Ana', avatar: '🦊' });
  const rb = await beto.pedir('jugador:unirse', { codigo, nombre: 'Beto', avatar: '🐸' });
  const rc = await caro.pedir('jugador:unirse', { codigo, nombre: 'Caro' });
  assert.ok(ra.ok && rb.ok && rc.ok);
  await hasta(() => ana.yo && beto.yo && caro.yo);
  assert.equal(saldo(ana), 100000);
  assert.equal(saldo(beto), 100000);
  assert.equal(ana.yo.avatar, '🦊');
  assert.equal((await cliente().pedir('jugador:unirse', { codigo, nombre: '' })).ok, false);
  paso('Tres jugadores se registran en modo demo con $1,000 ficticios cada uno');

  // ---------- Ruleta europea en vivo ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'ruleta:europea', ajustes: { tiempo: 0 } })).ok);
  await hasta(() => ana.casino?.mesa?.juego === 'ruleta');
  assert.ok((await ana.mesa('apostar', { clave: claveDe([17]), ficha: 1000 })).ok);
  assert.ok((await ana.mesa('apostar', { clave: 'rojo', ficha: 2500 })).ok);
  assert.ok((await beto.mesa('apostar', { clave: 'negro', ficha: 500 })).ok);
  assert.ok((await beto.mesa('apostar', { clave: 'd2', ficha: 10000 })).ok);
  assert.equal((await beto.mesa('apostar', { clave: claveDe([1, 5]), ficha: 100 })).ok, false);
  assert.equal((await beto.mesa('apostar', { clave: 'rojo', ficha: 333 })).ok, false);
  assert.ok((await beto.mesa('apostar', { clave: 'impar', ficha: 100 })).ok);
  assert.ok((await beto.mesa('deshacer')).ok);
  await quieto(beto);
  assert.equal(beto.yo.mesa.total, 10500);
  assert.equal(saldo(beto), 89500);
  assert.equal((await beto.mesa('girar')).ok, false, 'el jugador no gira la mesa en vivo');
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { resultado: 17 } });
  assert.ok((await host.pedir('anfitrion:accion', { tipo: 'girar' })).ok);
  assert.equal((await ana.mesa('apostar', { clave: 'rojo', ficha: 100 })).ok, false, 'no va más');
  await hasta(() => ana.casino.mesa.fase === 'pagos', 5000, 'pagos ruleta');
  await quieto(ana);
  assert.equal(saldo(ana), 100000 - 3500 + 36000);
  assert.equal(saldo(beto), 100000 - 10500 + 1000 + 30000);
  assert.equal(ana.casino.mesa.historial[0], 17);
  assert.ok(ana.eventos.some(([e, d]) => e === 'ev' && d.tipo === 'giro' && d.datos.resultado === 17));
  paso('Ruleta europea: pleno 35 a 1, docena 2 a 1, negro 1 a 1; el rojo pierde con el 17 negro');

  await hasta(() => ana.casino.mesa.fase === 'apuestas', 5000, 'nueva ronda');
  assert.ok((await ana.mesa('repetir')).ok);
  await quieto(ana);
  assert.equal(ana.yo.mesa.total, 3500);
  assert.ok((await ana.mesa('limpiar')).ok);
  await quieto(ana);
  assert.equal(saldo(ana), 132500);
  paso('Ruleta: repetir la apuesta anterior y limpiar el paño devuelve las fichas');

  // ---------- Ruleta francesa: La Partage y apuestas anunciadas ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'ruleta:francesa', ajustes: { tiempo: 0 } })).ok);
  await hasta(() => caro.casino?.mesa?.variante === 'francesa');
  assert.ok((await caro.mesa('apostar', { clave: 'rojo', ficha: 10000 })).ok);
  assert.ok((await caro.mesa('apostar', { anunciada: 'voisins', ficha: 100 })).ok);
  assert.ok((await caro.mesa('apostar', { anunciada: 'vecinos', numero: 26, ficha: 100 })).ok);
  await quieto(caro);
  assert.equal(caro.yo.mesa.total, 10000 + 900 + 500);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { resultado: 0 } });
  await host.pedir('anfitrion:accion', { tipo: 'girar' });
  await hasta(() => caro.casino.mesa.fase === 'pagos');
  await quieto(caro);
  // rojo: mitad (5000) · vecinos del cero: trío 0-2-3 con 2 fichas → 200 × 12 · vecinos del 26 incluye el 0 → 100 × 36
  assert.equal(saldo(caro), 100000 - 11400 + 5000 + 2400 + 3600);
  paso('Ruleta francesa: La Partage devuelve la mitad del rojo; vecinos del cero y vecinos del 26 pagan con el cero');

  // ---------- Ruleta americana: doble cero ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'ruleta:americana', ajustes: { tiempo: 0 } })).ok);
  await hasta(() => ana.casino?.mesa?.variante === 'americana');
  const s0 = saldo(ana);
  assert.ok((await ana.mesa('apostar', { clave: claveDe([0, 37]), ficha: 1000 })).ok);
  assert.ok((await ana.mesa('apostar', { clave: claveDe([0, 1, 2, 3, 37]), ficha: 500 })).ok);
  assert.equal((await ana.mesa('apostar', { anunciada: 'voisins', ficha: 100 })).ok, false);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { resultado: 37 } });
  await host.pedir('anfitrion:accion', { tipo: 'girar' });
  await hasta(() => ana.casino.mesa.fase === 'pagos');
  await quieto(ana);
  assert.equal(saldo(ana), s0 - 1500 + 18000 + 3500);
  paso('Ruleta americana: caballo 0-00 paga 17 a 1 y cinco números 6 a 1; no hay apuestas anunciadas');

  // ---------- Blackjack americano en vivo ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'blackjack:americano', ajustes: { tiempo: 0, turno: 30 } })).ok);
  await hasta(() => ana.casino?.mesa?.juego === 'blackjack');
  const sa = saldo(ana);
  const sb = saldo(beto);
  assert.ok((await ana.mesa('apostar', { zona: 'principal', ficha: 1000 })).ok);
  assert.ok((await beto.mesa('apostar', { zona: 'principal', ficha: 1000 })).ok);
  assert.equal((await beto.mesa('apostar', { zona: 'pares', ficha: 500 })).ok, false, 'americano sin laterales');
  // Reparto: Ana, Beto, crupier, Ana, Beto, oculta; luego la carta del crupier
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { cartas: ['10S', 'AS', '9H', 'KD', 'KH', '7C', '5D'] } });
  { const rl = await ana.mesa('listo'); assert.ok(rl.ok, JSON.stringify(rl)); }
  assert.ok((await beto.mesa('listo')).ok, 'todos listos reparte');
  await hasta(() => ana.casino.mesa.fase === 'turnos', 5000, 'turnos');
  await quieto(ana);
  assert.deepEqual(ana.yo.mesa.acciones, { pedir: true, plantarse: true, doblar: true, dividir: true, rendirse: false }, 'dos cartas de 10 se pueden dividir');
  assert.equal(beto.yo.mesa.asiento.manos[0].estado, 'blackjack');
  assert.equal(ana.casino.mesa.crupier.cartas.length, 1, 'la carta oculta no se ve');
  assert.ok((await ana.mesa('plantarse')).ok);
  await hasta(() => ana.casino.mesa.fase === 'pagos', 5000, 'pagos bj');
  await quieto(ana);
  assert.deepEqual(ana.casino.mesa.crupier.cartas, ['9H', '7C', '5D']);
  assert.equal(saldo(ana), sa - 1000);
  assert.equal(saldo(beto), sb + 1500);
  paso('Blackjack americano: crupier con 16 pide y hace 21; Ana pierde con 20 y el blackjack de Beto paga 3 a 2');

  // Seguro con blackjack del crupier
  await hasta(() => ana.casino.mesa.fase === 'apuestas', 5000);
  const sb2 = saldo(beto);
  assert.ok((await beto.mesa('apostar', { zona: 'principal', ficha: 1000 })).ok);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { cartas: ['10S', 'AS', '9D', 'KH'] } });
  await host.pedir('anfitrion:accion', { tipo: 'repartir' });
  await hasta(() => beto.casino.mesa.fase === 'seguro', 5000, 'seguro');
  assert.ok((await beto.mesa('seguro', { tomar: true })).ok);
  await hasta(() => beto.casino.mesa.fase === 'pagos', 5000);
  await quieto(beto);
  assert.equal(saldo(beto), sb2, 'el seguro compensa la mano perdida');
  paso('Blackjack: con As del crupier se ofrece seguro; con blackjack del crupier el seguro paga 2 a 1');

  // ---------- Blackjack Premium: laterales y rendición ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'blackjack:premium', ajustes: { tiempo: 0 } })).ok);
  await hasta(() => ana.casino?.mesa?.variante === 'premium');
  const sa3 = saldo(ana);
  assert.ok((await ana.mesa('apostar', { zona: 'principal', ficha: 1000 })).ok);
  assert.ok((await ana.mesa('apostar', { zona: 'pares', ficha: 500 })).ok);
  assert.ok((await ana.mesa('apostar', { zona: 'tresYmas', ficha: 500 })).ok);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { cartas: ['8H', '8H', '8H', 'KS'] } });
  await host.pedir('anfitrion:accion', { tipo: 'repartir' });
  await hasta(() => ana.casino.mesa.fase === 'turnos', 5000);
  await quieto(ana);
  assert.equal(ana.yo.mesa.asiento.laterales.pares.pago, 25);
  assert.equal(ana.yo.mesa.asiento.laterales.tresYmas.pago, 100);
  assert.ok(ana.yo.mesa.acciones.rendirse && ana.yo.mesa.acciones.dividir);
  assert.ok((await ana.mesa('rendirse')).ok);
  await hasta(() => ana.casino.mesa.fase === 'pagos', 5000);
  await quieto(ana);
  assert.equal(saldo(ana), sa3 - 2000 + 13000 + 50500 + 500);
  paso('Blackjack Premium: par perfecto 25 a 1, trío del mismo palo en 21+3 a 100 a 1 y rendición devuelve la mitad');

  // ---------- Blackjack individual: dividir y doblar ----------
  const sc = saldo(caro);
  const BJ = 'blackjack:americano';
  assert.ok((await caro.solo(BJ, 'apostar', { zona: 'principal', ficha: 1000 })).ok);
  await caro.solo(BJ, 'prueba', { cartas: ['8S', '6C', '8D', '10H', '3C', 'KD', '10C', '9S'] });
  assert.ok((await caro.solo(BJ, 'repartir')).ok);
  await hasta(() => caro.yo.solos[BJ]?.fase === 'turnos', 5000, 'turnos solo');
  assert.ok(caro.yo.solos[BJ].acciones.dividir);
  assert.ok((await caro.solo(BJ, 'dividir')).ok);
  await quieto(caro);
  assert.equal(caro.yo.solos[BJ].asiento.manos.length, 2);
  assert.ok((await caro.solo(BJ, 'doblar')).ok);
  assert.ok((await caro.solo(BJ, 'plantarse')).ok);
  await hasta(() => caro.yo.solos[BJ]?.fase === 'pagos', 5000, 'pagos solo');
  await quieto(caro);
  assert.deepEqual(caro.yo.solos[BJ].asiento.manos.map((m) => m.resultado), ['gana', 'gana']);
  assert.equal(saldo(caro), sc + 3000);
  paso('Blackjack individual: dividir ochos, doblar con 11 y ganar las dos manos cuando el crupier se pasa');

  // ---------- Videobingo en vivo ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'videobingo:clasico', ajustes: { tiempo: 0, extras: 40 } })).ok);
  await hasta(() => ana.casino?.mesa?.juego === 'videobingo' && ana.yo?.mesa?.cartones);
  const sa4 = saldo(ana);
  const carton0 = ana.yo.mesa.cartones[0];
  assert.ok((await ana.mesa('configurar', { activos: [true, true, true, true], apuesta: 100 })).ok);
  assert.ok((await ana.mesa('comprar')).ok);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { bolas: carton0 } });
  assert.ok((await host.pedir('anfitrion:accion', { tipo: 'sortear' })).ok);
  await hasta(() => ['extras', 'pagos'].includes(ana.casino.mesa.fase), 8000, 'sorteo');
  assert.equal(ana.casino.mesa.bolas.length, 30);
  assert.ok(carton0.every((n) => ana.casino.mesa.bolas.includes(n)));
  await quieto(ana);
  const marcadas = new Set(ana.casino.mesa.bolas);
  const esperado = premioTotal(ana.yo.mesa.cartones, [true, true, true, true], 100, marcadas);
  assert.equal(esperado.detalle[0].id, 'bingo');
  if (ana.casino.mesa.fase === 'extras' && !ana.yo.mesa.terminado) assert.ok((await ana.mesa('cobrar')).ok);
  await hasta(() => ana.casino.mesa.fase === 'pagos', 5000);
  await quieto(ana);
  assert.equal(saldo(ana), sa4 - 400 + esperado.total);
  assert.ok(ana.eventos.some(([e, d]) => e === 'ganancia' && d.juego === 'Videobingo'), 'ganancia en el muro');
  paso(`Videobingo en vivo: bingo en el primer cartón paga 1500× ($1,500) y aparece en el muro de ganadores`);

  // ---------- Videobingo individual con bola extra ----------
  const VB = 'videobingo:clasico';
  const sb5 = saldo(beto);
  await beto.solo(VB, 'abrir');
  await hasta(() => beto.yo.solos[VB]);
  const c = beto.yo.solos[VB].cartones[1];
  // 29 bolas dejan el cartón 2 a una bola de la línea de arriba; la siguiente bola se compra como extra
  const fila0 = [0, 1, 2, 3, 4].map((i) => c[i]);
  const resto = Array.from({ length: 60 }, (_, i) => i + 1).filter((n) => !fila0.includes(n) && !beto.yo.solos[VB].cartones.slice(0, 1).flat().includes(n));
  await beto.solo(VB, 'prueba', { bolas: [...fila0.slice(0, 4), ...resto.slice(0, 26)] });
  assert.ok((await beto.solo(VB, 'configurar', { activos: [false, true, false, false], apuesta: 500 })).ok);
  assert.ok((await beto.solo(VB, 'jugar')).ok);
  await quieto(beto);
  const st = beto.yo.solos[VB];
  assert.equal(st.bolas.length, 30);
  assert.ok(st.precio?.hay, 'debe ofrecer bola extra');
  {
    assert.ok(st.casi.some((x) => x.numero === fila0[4]) || st.casi.length > 0);
    const precio = st.precio.precio;
    const rx = await beto.solo(VB, 'extra');
    assert.ok(rx.ok);
    await quieto(beto);
    assert.equal(beto.yo.solos[VB].extras.length, 1);
    if (!beto.yo.solos[VB].terminado) await beto.solo(VB, 'cobrar');
    await quieto(beto);
    const fin = beto.yo.solos[VB];
    assert.equal(saldo(beto), sb5 + fin.resultado.neto);
    assert.equal(fin.resultado.apostado, 500 + precio);
  }
  paso('Videobingo individual: ofrece bola extra cuando falta un número, cobra su precio y paga el premio');

  // ---------- Lotería con pozo ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'loteria:tradicional', ajustes: { precio: 1000, velocidad: 0 } })).ok);
  await hasta(() => ana.casino?.mesa?.juego === 'loteria' && ana.yo?.mesa?.ofertas?.length === 6);
  await hasta(() => beto.yo?.mesa?.ofertas?.length === 6);
  const tablaAna = ana.yo.mesa.ofertas[0];
  assert.ok((await ana.mesa('elegir', { ids: [tablaAna.id] })).ok);
  assert.ok((await beto.mesa('elegir', { ids: [beto.yo.mesa.ofertas[0].id] })).ok);
  const sa6 = saldo(ana);
  const sb6 = saldo(beto);
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { orden: tablaAna.celdas } });
  assert.ok((await host.pedir('anfitrion:accion', { tipo: 'iniciar' })).ok);
  await hasta(() => ana.casino.mesa.fase === 'jugando', 5000);
  assert.equal(ana.casino.mesa.pozo, 2000);
  while (ana.casino.mesa.fase === 'jugando') {
    await host.pedir('anfitrion:accion', { tipo: 'siguiente' });
    await espera(5);
  }
  await hasta(() => ana.casino.mesa.fase === 'fin', 5000);
  await quieto(ana);
  assert.equal(ana.casino.mesa.ganadores[0].nombre, 'Ana');
  assert.equal(ana.casino.mesa.cantadas.length, 16);
  assert.equal(saldo(ana), sa6 - 1000 + 2000);
  assert.equal(saldo(beto), sb6 - 1000);
  paso('Lotería con pozo: cada tabla cuesta $10, Ana llena su tabla con la carta 16 y se lleva el pozo de $20');

  // ---------- Temporizadores en vivo ----------
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'ruleta:europea', ajustes: { tiempo: 10 } })).ok);
  await hasta(() => ana.casino?.mesa?.juego === 'ruleta' && ana.casino.mesa.cierreEn);
  assert.ok((await ana.mesa('apostar', { clave: 'rojo', ficha: 100 })).ok);
  await hasta(() => ana.casino.mesa.fase === 'pagos', 5000, 'cierre automático ruleta');
  await hasta(() => ana.casino.mesa.fase === 'apuestas' && ana.casino.mesa.ronda === 2, 5000, 'siguiente ronda');
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'blackjack:americano', ajustes: { tiempo: 10, turno: 15 } })).ok);
  await hasta(() => beto.casino?.mesa?.juego === 'blackjack');
  await host.pedir('anfitrion:accion', { tipo: 'prueba', datos: { cartas: ['10S', '9H', '7D', '10H'] } });
  assert.ok((await beto.mesa('apostar', { zona: 'principal', ficha: 500 })).ok);
  await hasta(() => beto.casino.mesa.fase === 'turnos', 5000, 'reparto automático');
  await hasta(() => beto.casino.mesa.fase === 'pagos', 5000, 'se planta solo al acabarse el tiempo');
  assert.equal(beto.casino.mesa.asientos[0].manos[0].estado, 'plantada');
  assert.ok((await host.pedir('anfitrion:mesa', { clave: 'videobingo:clasico', ajustes: { tiempo: 15, extras: 15 } })).ok);
  await hasta(() => caro.casino?.mesa?.juego === 'videobingo' && caro.yo?.mesa?.cartones);
  assert.ok((await caro.mesa('comprar')).ok);
  await hasta(() => caro.casino.mesa.fase === 'pagos', 8000, 'videobingo completo por tiempo');
  await quieto(caro);
  assert.ok(caro.yo.mesa.terminado && caro.yo.mesa.resultado);
  paso('Mesas en vivo con reloj: la ruleta cierra sola, el blackjack planta a quien no decide y el videobingo cobra al terminar el tiempo');

  // ---------- Recarga y ajustes ----------
  assert.equal((await caro.pedir('jugador:recargar')).ok, false, 'no recarga con saldo suficiente');
  assert.ok((await host.pedir('anfitrion:ajustes', { juegosLibres: false })).ok);
  assert.equal((await caro.solo('ruleta:europea', 'abrir')).ok, false);
  assert.ok((await host.pedir('anfitrion:ajustes', { juegosLibres: true })).ok);
  paso('Recarga rechazada con saldo suficiente; el anfitrión puede apagar los juegos individuales');

  // Reconexión: mismo saldo y movimientos
  const saldoAna = saldo(ana);
  ana.disconnect();
  await hasta(() => host.casino.jugadores.find((j) => j.nombre === 'Ana')?.conectado === false);
  const ana2 = cliente();
  const rr = await ana2.pedir('jugador:unirse', { codigo, token: ra.token });
  assert.ok(rr.reconectado);
  await hasta(() => ana2.yo);
  assert.equal(saldo(ana2), saldoAna);
  assert.ok(ana2.yo.movimientos.length >= 5);
  paso('Ana se desconecta y vuelve con su mismo saldo y su historial de movimientos');

  // Ranking por ganancia neta
  await quieto(host);
  const ranking = [...host.casino.jugadores].sort((a, b) => b.neto - a.neto).map((j) => j.nombre);
  assert.equal(ranking[0], 'Ana');
  for (const j of host.casino.jugadores) assert.equal(j.neto, j.saldo - 100000);
  paso(`Ranking por ganancia neta: ${ranking.join(', ')}`);

  // Seguridad
  assert.equal((await beto.pedir('anfitrion:accion', { tipo: 'siguiente' })).ok, false);
  assert.equal((await beto.pedir('anfitrion:mesa', { clave: 'ruleta:europea' })).ok, false);
  await host.pedir('anfitrion:expulsar', { id: rc.id });
  await hasta(() => caro.eventos.some(([e]) => e === 'expulsado'));
  assert.equal((await cliente().pedir('jugador:unirse', { codigo, token: rc.token })).ok, false);
  paso('Los controles del anfitrión están protegidos y un jugador expulsado no puede volver');

  // Podio
  assert.ok((await host.pedir('anfitrion:podio', { mostrar: true })).ok);
  await hasta(() => host.casino.fase === 'podio' && host.casino.mesa === null);
  paso('El anfitrión termina con el podio y se cierra la mesa');

  console.log(`\n${ok} comprobaciones superadas ✅\n`);
  process.exitCode = 0;
} catch (e) {
  console.error('\n❌ Falló:', e);
  process.exitCode = 1;
} finally {
  srv.kill();
  setTimeout(() => process.exit(), 200);
}
