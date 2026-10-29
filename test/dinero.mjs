// Prueba de estrés del monedero: bots que apuestan al azar en todas las mesas (en vivo e individuales)
// mientras el anfitrión cambia de juego. Al final, el saldo de cada jugador debe cuadrar al centavo
// con la suma de sus movimientos, y nadie puede quedar con saldo negativo.
process.env.CASINO_ESCALA_TIEMPO = '0.01';
process.env.CASINO_PRUEBAS = '1';
const assert = (await import('node:assert/strict')).default;
const { Casino } = await import('../src/casino.js');
const { apuestasValidas, FICHAS: FR } = await import('../public/js/shared/ruleta.js');
const { FICHAS: FB } = await import('../public/js/shared/blackjack.js');
const { APUESTAS } = await import('../public/js/shared/videobingo.js');

const errores = [];
const errorOriginal = console.error;
console.error = (...a) => errores.push(a.map(String).join(' '));
const io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
const casino = new Casino('123456', { recargas: 99, juegosLibres: true }, io);
const azar = (n) => Math.floor(Math.random() * n);
const uno = (a) => a[azar(a.length)];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Contabilidad paralela
const neto = new Map();
const anotar = casino.anotar.bind(casino);
casino.anotar = (j, n, c) => {
  neto.set(j.id, (neto.get(j.id) || 0) + n);
  anotar(j, n, c);
};
let minimo = Infinity;
const cobrar = casino.cobrar.bind(casino);
casino.cobrar = (j, m) => {
  const r = cobrar(j, m);
  minimo = Math.min(minimo, j.saldo);
  return r;
};

const jugadores = [];
for (let i = 0; i < 8; i++) {
  const r = casino.unir({ id: 's' + i }, { nombre: 'Bot ' + i });
  jugadores.push(r.jugador);
}

const CLAVES_VIVO = ['ruleta:americana', 'ruleta:europea', 'ruleta:francesa', 'blackjack:americano', 'blackjack:premium', 'videobingo:clasico', 'loteria:tradicional'];
const CLAVES_SOLO = CLAVES_VIVO.filter((c) => !c.startsWith('loteria'));
let acciones = 0;

function accionRuleta(hacer, variante) {
  const claves = [...apuestasValidas(variante).keys()];
  const t = uno(['apostar', 'apostar', 'apostar', 'apostar', 'deshacer', 'limpiar', 'repetir', 'doblar', 'girar']);
  if (t === 'apostar' && Math.random() < 0.15) return hacer('apostar', { anunciada: uno(['voisins', 'tiers', 'orphelins', 'jeuzero', 'vecinos']), numero: azar(37), ficha: uno(FR) });
  return hacer(t, { clave: uno(claves), ficha: uno(FR) });
}
function accionBJ(hacer) {
  const t = uno(['apostar', 'apostar', 'listo', 'repartir', 'repetir', 'limpiar', 'pedir', 'plantarse', 'doblar', 'dividir', 'rendirse', 'seguro']);
  return hacer(t, { zona: uno(['principal', 'principal', 'pares', 'tresYmas']), ficha: uno(FB), tomar: Math.random() < 0.5 });
}
function accionVB(hacer) {
  const t = uno(['configurar', 'comprar', 'jugar', 'extra', 'extra', 'cobrar', 'cambiar', 'cancelar']);
  return hacer(t, { apuesta: uno(APUESTAS), activos: [0, 1, 2, 3].map(() => Math.random() < 0.7) });
}
function accionLot(hacer, j) {
  const est = casino.mesa?.est?.get(j.id);
  const t = uno(['elegir', 'marcar', 'loteria', 'ofertas']);
  if (t === 'elegir' && est) return hacer('elegir', { ids: [...est.ofertas.keys()].slice(0, 1 + azar(3)) });
  return hacer(t, { tablaId: est?.tablas[0]?.id, i: azar(16), puesto: true });
}

function actuar(j) {
  // Mesa en vivo
  const m = casino.mesa;
  if (m) {
    const hacer = (t, d) => casino.accionMesa(j, t, d);
    const juego = m.constructor.juego;
    if (juego === 'ruleta') accionRuleta(hacer, m.variante);
    else if (juego === 'blackjack') accionBJ(hacer);
    else if (juego === 'videobingo') accionVB(hacer);
    else accionLot(hacer, j);
  }
  // Juego individual
  if (Math.random() < 0.5) {
    const clave = uno(CLAVES_SOLO);
    const hacer = (t, d) => casino.accionSolo(j, clave, t, d);
    if (Math.random() < 0.03) return hacer('cerrar');
    if (clave.startsWith('ruleta')) accionRuleta(hacer, clave.split(':')[1]);
    else if (clave.startsWith('blackjack')) accionBJ(hacer);
    else accionVB(hacer);
  }
  if (j.saldo < 5000 && Math.random() < 0.3) casino.recargar(j);
  acciones++;
}

console.log('\nEstrés del monedero\n');
const t0 = Date.now();
let mesas = 0;
let k = 0;
while (Date.now() - t0 < 20000) {
  if (k % 120 === 0) {
    const clave = CLAVES_VIVO[mesas % CLAVES_VIVO.length];
    const r = casino.abrirMesa({ clave, ajustes: { tiempo: 10, turno: 15, extras: 15, velocidad: 2, precio: 500, reinicio: 15 } });
    assert.ok(r.ok, r.error);
    mesas++;
  }
  // El anfitrión empuja la mesa de vez en cuando
  if (Math.random() < 0.05 && casino.mesa) casino.hostMesa(uno(['girar', 'repartir', 'sortear', 'iniciar', 'siguiente']), {});
  for (const j of jugadores) actuar(j);
  k++;
  await espera(2);
}
// Cerrar todo: las rondas a medias se devuelven
casino.cerrarMesa();
for (const j of jugadores) for (const c of CLAVES_SOLO) casino.accionSolo(j, c, 'cerrar');
await espera(300);

let ok = 0;
for (const j of jugadores) {
  const esperado = j.depositado + (neto.get(j.id) || 0);
  assert.equal(j.saldo, esperado, `${j.nombre}: saldo ${j.saldo} ≠ depositado ${j.depositado} + movimientos ${neto.get(j.id) || 0}`);
  ok++;
}
assert.ok(minimo >= 0, 'nadie quedó con saldo negativo');
console.error = errorOriginal;
assert.equal(errores.length, 0, 'errores en el servidor:\n' + errores.slice(0, 5).join('\n'));
const recargas = jugadores.reduce((s, j) => s + j.recargas, 0);
console.log(`  ✔ ${acciones.toLocaleString('es-MX')} acciones al azar en ${mesas} mesas en vivo y ${CLAVES_SOLO.length} juegos individuales, ${recargas} recargas`);
console.log(`  ✔ Los ${ok} saldos cuadran al centavo con sus movimientos; nadie quedó en negativo; sin errores en el servidor`);
const casa = jugadores.reduce((s, j) => s - (j.saldo - j.depositado), 0);
console.log(`    (la casa ganó ${(casa / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} ficticios en total)\n`);
casino.cerrar();
process.exit(0);
