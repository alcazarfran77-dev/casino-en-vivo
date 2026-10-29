import crypto from 'node:crypto';

export const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');
export const azar = (n) => crypto.randomInt(n);
export const azarReal = () => crypto.randomInt(2 ** 32) / 2 ** 32;

export function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Para pruebas: CASINO_ESCALA_TIEMPO=0.05 acelera todas las esperas del servidor.
const ESCALA = Number(process.env.CASINO_ESCALA_TIEMPO) > 0 ? Number(process.env.CASINO_ESCALA_TIEMPO) : 1;
export const ms = (x) => Math.max(1, Math.round(x * ESCALA));
export const PRUEBAS = process.env.CASINO_PRUEBAS === '1';

export const texto = (v, max, def = '') => (typeof v === 'string' ? v.trim().slice(0, max) : def);
export const color = (v, def) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
export const entero = (v, min, max, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
export const elegir = (v, opciones, def) => (opciones.includes(v) ? v : def);

export const dinero = (c) => {
  const d = c / 100;
  return '$' + d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 });
};

// Base de todas las mesas: temporizadores, emisión y acceso al casino.
export class Mesa {
  constructor(casino, { solo = null } = {}) {
    this.casino = casino;
    this.solo = solo;
    this.timers = {};
    this.muerta = false;
  }
  t(nombre, espera, fn) {
    clearTimeout(this.timers[nombre]);
    this.timers[nombre] = setTimeout(() => {
      delete this.timers[nombre];
      if (this.muerta) return;
      try {
        fn();
      } catch (e) {
        console.error(`[${this.constructor.juego}]`, e);
      }
    }, espera);
  }
  quitar(nombre) {
    clearTimeout(this.timers[nombre]);
    delete this.timers[nombre];
  }
  destruir() {
    for (const k of Object.keys(this.timers)) clearTimeout(this.timers[k]);
    this.timers = {};
    this.muerta = true;
  }
  actualizar() {
    this.casino.actualizar(this.solo);
  }
  evento(tipo, datos) {
    this.casino.evento(this.constructor.juego, tipo, datos, this.solo);
  }
  participantes() {
    if (this.solo) return [this.solo];
    return [...this.casino.jugadores.values()].filter((j) => !j.expulsado);
  }
  jugador(id) {
    return this.casino.jugadores.get(id);
  }
}
