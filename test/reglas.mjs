// Pruebas de las reglas y la matemática de cada juego (sin servidor).
import assert from 'node:assert/strict';
import * as R from '../public/js/shared/ruleta.js';
import * as B from '../public/js/shared/blackjack.js';
import * as V from '../public/js/shared/videobingo.js';

let ok = 0;
const paso = (m) => {
  ok++;
  console.log('  ✔ ' + m);
};
const pct = (x) => (x * 100).toFixed(2) + ' %';

console.log('\nReglas del casino\n');

// ---------------- Ruleta ----------------
for (const v of Object.keys(R.VARIANTES)) {
  const m = R.apuestasValidas(v);
  const cas = R.casillas(v);
  const tipos = {};
  for (const d of m.values()) {
    // Ventaja exacta de la casa por apuesta: retorno esperado / apostado - 1
    let suma = 0;
    for (const r of cas) suma += R.retorno(d, 100, r, v);
    const ev = suma / cas.length / 100 - 1;
    (tipos[d.tipo] ||= new Set()).add(ev.toFixed(6));
    // Cada apuesta cubre exactamente los números que dice su pago
    const cubre = d.numeros.length;
    assert.equal(d.pago, Math.round(36 / cubre) - 1, `${v} ${d.nombre}`);
  }
  const resumen = Object.entries(tipos).map(([t, s]) => `${t} ${[...s].map((x) => pct(-x)).join('/')}`);
  console.log(`    ${v}: ${m.size} apuestas · ` + resumen.join(', '));
  const esperado = { americana: 2 / 38, europea: 1 / 37, francesa: 1 / 37 }[v];
  for (const [t, s] of Object.entries(tipos)) {
    for (const x of s) {
      let e = esperado;
      if (v === 'americana' && t === 'cinco') e = 3 / 38;
      if (v === 'francesa' && t === 'sencilla') e = 1 / 74;
      assert.ok(Math.abs(-Number(x) - e) < 1e-6, `${v} ${t} ventaja ${-x} vs ${e}`);
    }
  }
}
paso('Ruleta: todas las apuestas pagan bien y la ventaja es 5.26 % (americana), 2.70 % (europea) y 1.35 % en sencillas francesas');

assert.equal(R.apuestasValidas('americana').size, 38 + 62 + 15 + 22 + 11 + 1 + 12, 'conteo americana');
assert.ok(R.apuestasValidas('americana').has(R.claveDe([0, 37])));
assert.ok(!R.apuestasValidas('europea').has(R.claveDe([0, 37])));
assert.ok(R.apuestasValidas('europea').has(R.claveDe([0, 1, 2, 3])));
assert.ok(!R.apuestasValidas('europea').has(R.claveDe([1, 5])), 'caballo inválido');
paso('Ruleta: caballos, calles y cinco números válidos según la variante');

for (const a of Object.keys(R.ANUNCIADAS)) {
  const ex = R.expandirAnunciada(a, 100, 'europea');
  assert.ok(ex.every((x) => R.apuestasValidas('europea').has(x.clave)), a);
  assert.equal(ex.reduce((s, x) => s + x.monto, 0), R.fichasAnunciada(a) * 100);
}
assert.deepEqual(R.vecinos(0, 'europea'), [3, 26, 0, 32, 15]);
assert.equal(R.expandirAnunciada('voisins', 100, 'americana'), null);
// Las anunciadas cubren el cilindro completo sin huecos
const cubiertos = new Set();
for (const a of ['voisins', 'tiers', 'orphelins']) for (const x of R.expandirAnunciada(a, 100, 'europea')) for (const n of R.apuestasValidas('europea').get(x.clave).numeros) cubiertos.add(n);
assert.equal(cubiertos.size, 37);
paso('Ruleta: vecinos, tercio y huérfanos cubren los 37 números; vecinos de N toma 2 a cada lado');

// La Partage
const rojo = R.apuestasValidas('francesa').get('rojo');
assert.equal(R.retorno(rojo, 1000, 0, 'francesa'), 500);
assert.equal(R.retorno(rojo, 1000, 0, 'europea'), 0);
assert.equal(R.retorno(rojo, 1000, 1, 'francesa'), 2000);
paso('Ruleta francesa: con cero, La Partage devuelve la mitad de las suertes sencillas');

// ---------------- Blackjack ----------------
assert.deepEqual(B.total(['AS', 'KD']), { total: 21, blanda: true });
assert.deepEqual(B.total(['AS', 'AD', '9C']), { total: 21, blanda: true });
assert.deepEqual(B.total(['AS', '6D', '10C']), { total: 17, blanda: false });
assert.ok(B.esBlackjack(['AS', 'QH']));
assert.ok(!B.esBlackjack(['AS', 'QH'], true));
assert.ok(!B.esBlackjack(['7S', '7H', '7D']));
assert.equal(B.textoTotal(['AS', '6D']), '7 o 17');
assert.ok(B.crupierPide(['AS', '6D'], true));
assert.ok(!B.crupierPide(['AS', '6D'], false));
assert.ok(!B.crupierPide(['10S', '7D'], true));
paso('Blackjack: totales blandos y duros, blackjack natural, crupier H17 (americano) y S17 (Premium)');

assert.equal(B.paresPerfectos('8H', '8H').pago, 25);
assert.equal(B.paresPerfectos('8H', '8D').pago, 12);
assert.equal(B.paresPerfectos('8H', '8S').pago, 6);
assert.equal(B.paresPerfectos('8H', '9H'), null);
assert.equal(B.veintiunoMasTres('7H', '7H', '7H').pago, 100);
assert.equal(B.veintiunoMasTres('5H', '6H', '7H').pago, 40);
assert.equal(B.veintiunoMasTres('7H', '7S', '7D').pago, 30);
assert.equal(B.veintiunoMasTres('QH', 'KS', 'AD').pago, 10);
assert.equal(B.veintiunoMasTres('AH', '2S', '3D').pago, 10);
assert.equal(B.veintiunoMasTres('KH', 'AS', '2D'), null);
assert.equal(B.veintiunoMasTres('2H', '9H', 'KH').pago, 5);
paso('Blackjack Premium: Pares perfectos (6/12/25 a 1) y 21+3 (5 a 100 a 1)');

// Simulación de estrategia básica para comprobar que la ventaja es razonable
function simularBJ(variante, manos = 120000) {
  const reg = B.VARIANTES[variante];
  let zapato = [];
  const sacar = () => {
    if (zapato.length < 80) {
      zapato = B.mazos(reg.mazos);
      for (let i = zapato.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [zapato[i], zapato[j]] = [zapato[j], zapato[i]];
      }
    }
    return zapato.pop();
  };
  let neto = 0;
  for (let h = 0; h < manos; h++) {
    const mano = [sacar(), sacar()];
    const crup = [sacar(), sacar()];
    if (B.esBlackjack(crup)) {
      if (!B.esBlackjack(mano)) neto -= 1;
      continue;
    }
    if (B.esBlackjack(mano)) {
      neto += reg.pagoBJ;
      continue;
    }
    const pila = [{ cartas: mano, apuesta: 1, div: false }];
    const hechas = [];
    while (pila.length) {
      const m = pila.shift();
      for (;;) {
        const puede = { doblar: m.cartas.length === 2, dividir: m.cartas.length === 2 && B.valorDe(m.cartas[0]) === B.valorDe(m.cartas[1]) && pila.length + hechas.length < 3, rendirse: reg.rendicion && !m.div && m.cartas.length === 2 && pila.length + hechas.length === 0 };
        if (B.total(m.cartas).total >= 21) break;
        const c = B.consejo(m, crup[0], puede);
        if (c === 'plantarse') break;
        if (c === 'rendirse') {
          m.rendida = true;
          break;
        }
        if (c === 'dividir') {
          const otra = { cartas: [m.cartas[1], sacar()], apuesta: 1, div: true };
          m.cartas = [m.cartas[0], sacar()];
          m.div = true;
          pila.push(otra);
          if (B.rangoDe(m.cartas[0]) === 'A') {
            hechas.push(m, otra);
            pila.pop();
            m.fin = otra.fin = true;
            break;
          }
          continue;
        }
        m.cartas.push(sacar());
        if (c === 'doblar') {
          m.apuesta = 2;
          break;
        }
      }
      if (!m.fin) hechas.push(m);
    }
    while (B.crupierPide(crup, reg.h17)) crup.push(sacar());
    const tc = B.total(crup).total;
    for (const m of hechas) {
      if (m.rendida) {
        neto -= 0.5;
        continue;
      }
      const t = B.total(m.cartas).total;
      if (t > 21) neto -= m.apuesta;
      else if (tc > 21 || t > tc) neto += m.apuesta;
      else if (t < tc) neto -= m.apuesta;
    }
  }
  return neto / manos;
}
for (const v of ['americano', 'premium']) {
  const r = simularBJ(v);
  console.log(`    ${v}: retorno con estrategia básica simplificada ${pct(r)} por mano`);
  assert.ok(r > -0.03 && r < 0.01, `${v} ventaja fuera de rango: ${r}`);
}
paso('Blackjack: con estrategia básica la casa gana poco (entre 0 y 3 %), como en un casino real');

// ---------------- Videobingo ----------------
const c = V.generarCartones();
assert.equal(new Set(c.flat()).size, 60);
for (const carton of c) {
  for (let col = 0; col < 5; col++) {
    const nums = [0, 1, 2].map((r) => carton[r * 5 + col]);
    assert.ok(nums.every((n) => n > col * 12 && n <= col * 12 + 12));
    assert.ok(nums[0] < nums[1] && nums[1] < nums[2]);
  }
}
paso('Videobingo: los 4 cartones reparten los 60 números, 12 por columna y ordenados');

const todas = new Set(c[0]);
assert.equal(V.premioCarton(c[0], todas).id, 'bingo');
const esq = new Set([0, 4, 10, 14].map((i) => c[1][i]));
assert.equal(V.premioCarton(c[1], esq).id, 'esquinas');
const linea = new Set([5, 6, 7, 8, 9].map((i) => c[2][i]));
assert.equal(V.premioCarton(c[2], linea).id, 'linea');
paso('Videobingo: detecta bingo, línea y esquinas; paga solo la mejor figura de cada cartón');

function simularVB(rondas, conExtras) {
  let apostado = 0;
  let pagado = 0;
  let extrasCompradas = 0;
  for (let k = 0; k < rondas; k++) {
    const cart = V.generarCartones();
    const bolas = Array.from({ length: 60 }, (_, i) => i + 1);
    for (let i = 59; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bolas[i], bolas[j]] = [bolas[j], bolas[i]];
    }
    const marcadas = new Set(bolas.slice(0, 30));
    const restantes = bolas.slice(30);
    const activos = [true, true, true, true];
    apostado += 4 * 100;
    if (conExtras) {
      for (let e = 0; e < V.MAX_EXTRA; e++) {
        const p = V.precioExtra(cart, activos, 100, marcadas, restantes);
        // Jugador que compra solo si el valor esperado supera la mitad del precio
        if (!p.hay || p.ev < p.precio * 0.5) break;
        assert.ok(p.precio >= p.ev, 'el precio cubre el valor esperado');
        apostado += p.precio;
        extrasCompradas++;
        marcadas.add(restantes.shift());
      }
    }
    pagado += V.premioTotal(cart, activos, 100, marcadas).total;
  }
  return { rtp: pagado / apostado, extras: extrasCompradas / rondas };
}
const base = simularVB(40000, false);
console.log(`    retorno al jugador sin bolas extra: ${pct(base.rtp)}`);
assert.ok(base.rtp > 0.85 && base.rtp < 0.97, 'RTP base fuera de rango ' + base.rtp);
const ext = simularVB(8000, true);
console.log(`    retorno comprando bolas extra: ${pct(ext.rtp)} (${ext.extras.toFixed(2)} bolas extra por ronda)`);
assert.ok(ext.rtp < 1, 'con extras la casa sigue ganando');
paso('Videobingo: la casa conserva su ventaja con y sin bolas extra');

console.log(`\n${ok} comprobaciones superadas ✅\n`);
