// Una sala de casino: jugadores registrados en modo demo, su monedero ficticio,
// la mesa en vivo que elige el anfitrión y los juegos individuales de cada jugador.
import { rid, texto, PRUEBAS } from './util.js';
import { Ruleta } from './juegos/ruleta.js';
import { Blackjack } from './juegos/blackjack.js';
import { Videobingo } from './juegos/videobingo.js';
import { Loteria, normalizarBaraja } from './juegos/loteria.js';
import { CATALOGO, porClave, AVATARES, SALDO_INICIAL, RECARGA_UMBRAL } from '../public/js/shared/catalogo.js';
import { barajaPorDefecto } from '../public/js/shared/baraja.js';

const CLASES = { ruleta: Ruleta, blackjack: Blackjack, videobingo: Videobingo, loteria: Loteria };
const MAX_JUGADORES = 200;
const RECARGAS = [0, 1, 3, 99];
export const REACCIONES = ['👏', '🔥', '😱', '😂', '🙏', '💃', '🤑', '😭'];

export function normalizarAjustesCasino(a = {}, previo = { recargas: 1, juegosLibres: true }) {
  const r = { ...previo };
  if (a.recargas !== undefined && RECARGAS.includes(Number(a.recargas))) r.recargas = Number(a.recargas);
  if (a.juegosLibres !== undefined) r.juegosLibres = Boolean(a.juegosLibres);
  return r;
}

export class Casino {
  constructor(codigo, ajustes, io) {
    this.codigo = codigo;
    this.io = io;
    this.tokenAnfitrion = rid(18);
    this.socketAnfitrion = null;
    this.ajustes = normalizarAjustesCasino(ajustes);
    this.jugadores = new Map();
    this.mesa = null;
    this.solos = new Map(); // id jugador → Map(clave → mesa individual)
    this.feed = [];
    this.fase = 'abierto'; // abierto | podio
    this.versionBaraja = 0;
    this.ponerBaraja(barajaPorDefecto());
    this.actividad = Date.now();
    this.sucios = new Set();
    this.publicoSucio = false;
    this.timerEmision = null;
  }

  toque() {
    this.actividad = Date.now();
  }

  cambiarAjustes(d) {
    this.ajustes = normalizarAjustesCasino(d, this.ajustes);
    if (!this.ajustes.juegosLibres) {
      for (const [id, mapa] of this.solos) {
        for (const m of mapa.values()) {
          m.cancelar();
          m.destruir();
        }
        const j = this.jugadores.get(id);
        if (j && mapa.size) this.avisar(j, 'El anfitrión cerró los juegos individuales: te devolvimos las fichas que tenías en juego.');
      }
      this.solos.clear();
    }
    this.actualizar();
    return { ok: true };
  }

  // ---------- Monedero ----------
  cobrar(j, monto) {
    if (!Number.isInteger(monto) || monto <= 0 || j.saldo < monto) return false;
    j.saldo -= monto;
    this.marcar(j);
    return true;
  }
  abonar(j, monto) {
    if (!Number.isInteger(monto) || monto <= 0) return;
    j.saldo += monto;
    this.marcar(j);
  }
  anotar(j, neto, concepto) {
    j.movimientos.unshift({ t: Date.now(), neto, concepto, saldo: j.saldo });
    j.movimientos = j.movimientos.slice(0, 40);
    if (neto > 0) j.ganado += neto;
    j.jugadas++;
    this.marcar(j);
  }
  recargasRestantes(j) {
    return Math.max(0, this.ajustes.recargas - j.recargas);
  }
  recargar(j) {
    if (this.recargasRestantes(j) <= 0) return { ok: false, error: 'El anfitrión no permite más recargas.' };
    if (j.saldo >= RECARGA_UMBRAL) return { ok: false, error: 'Puedes recargar cuando tu saldo baje de $50.' };
    j.recargas++;
    j.depositado += SALDO_INICIAL;
    j.saldo += SALDO_INICIAL;
    j.movimientos.unshift({ t: Date.now(), neto: SALDO_INICIAL, concepto: 'Recarga de saldo ficticio', saldo: j.saldo, recarga: true });
    this.marcar(j);
    return { ok: true };
  }

  anunciar(j, neto, juego) {
    const item = { id: rid(4), nombre: j.nombre, avatar: j.avatar, neto, juego, t: Date.now() };
    this.feed.unshift(item);
    this.feed = this.feed.slice(0, 12);
    this.io.to(this.codigo).emit('ganancia', item);
    this.programar();
  }
  avisar(j, texto) {
    if (j.socketId && j.conectado) this.io.to(j.socketId).emit('aviso', texto);
  }

  // ---------- Emisión agrupada ----------
  marcar(j) {
    this.sucios.add(j.id);
    this.programar();
  }
  programar() {
    this.publicoSucio = true;
    if (!this.timerEmision) this.timerEmision = setTimeout(() => this.vaciar(), 25);
  }
  actualizar(solo) {
    if (solo) this.marcar(solo);
    else {
      for (const j of this.jugadores.values()) this.sucios.add(j.id);
      this.programar();
    }
  }
  vaciar() {
    this.timerEmision = null;
    if (this.publicoSucio) {
      this.publicoSucio = false;
      this.io.to(this.codigo).emit('casino', this.publico());
    }
    for (const id of this.sucios) {
      const j = this.jugadores.get(id);
      if (j?.socketId && j.conectado && !j.expulsado) this.io.to(j.socketId).emit('yo', this.privado(j));
    }
    this.sucios.clear();
  }
  evento(juego, tipo, datos, solo) {
    const msg = { juego, tipo, datos, solo: Boolean(solo) };
    if (solo) {
      if (solo.socketId) this.io.to(solo.socketId).emit('ev', msg);
    } else this.io.to(this.codigo).emit('ev', msg);
  }

  // ---------- Estado ----------
  vistaJugador(j) {
    return { id: j.id, nombre: j.nombre, avatar: j.avatar, saldo: j.saldo, neto: j.saldo - j.depositado, conectado: j.conectado, recargas: j.recargas, jugadas: j.jugadas };
  }

  publico() {
    return {
      codigo: this.codigo,
      fase: this.fase,
      ajustes: this.ajustes,
      jugadores: [...this.jugadores.values()].filter((j) => !j.expulsado).map((j) => this.vistaJugador(j)),
      mesa: this.mesa ? { juego: this.mesa.constructor.juego, variante: this.mesa.variante, ...this.mesa.publico() } : null,
      feed: this.feed.slice(0, 8),
      baraja: { version: this.versionBaraja, total: this.baraja.cartas.length, nombre: this.baraja.nombre },
      ahora: Date.now(),
    };
  }

  privado(j) {
    const solos = {};
    for (const [clave, s] of this.solos.get(j.id) || []) solos[clave] = { ...s.publico(), ...s.privado(j) };
    return {
      ...this.vistaJugador(j),
      recargasRestantes: this.recargasRestantes(j),
      puedeRecargar: this.recargasRestantes(j) > 0 && j.saldo < RECARGA_UMBRAL,
      movimientos: j.movimientos.slice(0, 20),
      mesa: this.mesa ? { juego: this.mesa.constructor.juego, variante: this.mesa.variante, ...this.mesa.privado(j) } : null,
      solos,
      ahora: Date.now(),
    };
  }

  // ---------- Jugadores ----------
  unir(socket, { nombre, avatar, token }) {
    this.toque();
    if (token) {
      const previo = [...this.jugadores.values()].find((j) => j.token === token);
      if (previo) {
        if (previo.expulsado) return { ok: false, error: 'El anfitrión te sacó de esta sala.' };
        previo.socketId = socket.id;
        previo.conectado = true;
        this.marcar(previo);
        return { ok: true, jugador: previo, reconectado: true };
      }
    }
    const limpio = texto(nombre, 20);
    if (!limpio) return { ok: false, error: 'Escribe tu nombre para registrarte.' };
    const activos = [...this.jugadores.values()].filter((j) => !j.expulsado);
    if (activos.length >= MAX_JUGADORES) return { ok: false, error: 'La sala está llena.' };
    let final = limpio;
    let k = 2;
    const usados = new Set(activos.map((j) => j.nombre.toLowerCase()));
    while (usados.has(final.toLowerCase())) final = `${limpio} ${k++}`;
    const j = {
      id: rid(6),
      token: rid(18),
      nombre: final,
      avatar: AVATARES.includes(avatar) ? avatar : AVATARES[activos.length % AVATARES.length],
      socketId: socket.id,
      conectado: true,
      saldo: SALDO_INICIAL,
      depositado: SALDO_INICIAL,
      recargas: 0,
      ganado: 0,
      jugadas: 0,
      movimientos: [{ t: Date.now(), neto: SALDO_INICIAL, concepto: 'Bienvenida: saldo ficticio de modo demo', saldo: SALDO_INICIAL, recarga: true }],
      ultimaReaccion: 0,
      expulsado: false,
    };
    this.jugadores.set(j.id, j);
    this.actualizar();
    return { ok: true, jugador: j, reconectado: false };
  }

  desconectar(socketId) {
    if (this.socketAnfitrion === socketId) this.socketAnfitrion = null;
    for (const j of this.jugadores.values()) {
      if (j.socketId === socketId) {
        j.conectado = false;
        this.programar();
      }
    }
  }

  expulsar(id) {
    const j = this.jugadores.get(id);
    if (!j) return { ok: false };
    j.expulsado = true;
    for (const s of this.solos.get(id)?.values() || []) s.destruir();
    this.solos.delete(id);
    if (j.socketId) {
      this.io.to(j.socketId).emit('expulsado');
      this.io.sockets.sockets.get(j.socketId)?.leave(this.codigo);
    }
    this.actualizar();
    return { ok: true };
  }

  reaccionar(j, emoji) {
    const ahora = Date.now();
    if (!REACCIONES.includes(emoji) || ahora - j.ultimaReaccion < 1200) return { ok: false };
    j.ultimaReaccion = ahora;
    this.io.to(this.codigo).emit('reaccion', { nombre: j.nombre, avatar: j.avatar, emoji });
    return { ok: true };
  }

  // ---------- Mesas ----------
  abrirMesa({ clave, ajustes } = {}) {
    this.toque();
    const info = porClave(String(clave));
    if (!info) return { ok: false, error: 'Ese juego no existe.' };
    const Clase = CLASES[info.juego];
    let nueva;
    try {
      nueva = new Clase(this, { variante: info.variante, ajustes });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    this.cerrarMesa(false);
    this.mesa = nueva;
    this.fase = 'abierto';
    this.actualizar();
    return { ok: true };
  }

  cerrarMesa(emitir = true) {
    if (!this.mesa) return { ok: true };
    this.mesa.cancelar();
    this.mesa.destruir();
    this.mesa = null;
    if (emitir) this.actualizar();
    return { ok: true };
  }

  accionMesa(j, tipo, datos) {
    this.toque();
    if (!this.mesa) return { ok: false, error: 'No hay mesa abierta.' };
    return this.mesa.accion(j, String(tipo), datos || {});
  }

  hostMesa(tipo, datos) {
    this.toque();
    if (!this.mesa) return { ok: false, error: 'No hay mesa abierta.' };
    if (tipo === 'prueba' && !PRUEBAS) return { ok: false };
    return this.mesa.host(String(tipo), datos || {});
  }

  accionSolo(j, clave, tipo, datos) {
    this.toque();
    if (!this.ajustes.juegosLibres) return { ok: false, error: 'El anfitrión desactivó los juegos individuales.' };
    const info = porClave(String(clave));
    if (!info?.solo) return { ok: false, error: 'Ese juego no se puede jugar por tu cuenta.' };
    let mapa = this.solos.get(j.id);
    if (!mapa) {
      mapa = new Map();
      this.solos.set(j.id, mapa);
    }
    if (tipo === 'cerrar') {
      const s = mapa.get(info.clave);
      if (s) {
        s.cancelar();
        s.destruir();
        mapa.delete(info.clave);
      }
      this.marcar(j);
      return { ok: true };
    }
    let s = mapa.get(info.clave);
    if (!s) {
      s = new CLASES[info.juego](this, { variante: info.variante, solo: j });
      mapa.set(info.clave, s);
    }
    if (tipo === 'abrir') {
      this.marcar(j);
      return { ok: true };
    }
    if (tipo === 'prueba') return PRUEBAS ? s.host('prueba', datos || {}) : { ok: false };
    return s.accion(j, String(tipo), datos || {});
  }

  // ---------- Lotería: baraja del casino ----------
  ponerBaraja(cruda) {
    const { baraja, imagenes } = normalizarBaraja(cruda);
    const antes = this.baraja ? this.baraja.cartas.map((c) => c.id).join(',') : null;
    this.baraja = baraja;
    this.imagenes = imagenes;
    this.versionBaraja++;
    return antes !== null && antes !== baraja.cartas.map((c) => c.id).join(',');
  }

  cambiarBaraja(cruda) {
    if (this.mesa instanceof Loteria && ['jugando', 'barajando'].includes(this.mesa.fase)) return { ok: false, error: 'Cambia la baraja entre partidas.' };
    const respaldo = { baraja: this.baraja, imagenes: this.imagenes, versionBaraja: this.versionBaraja };
    let cambio;
    try {
      cambio = this.ponerBaraja(cruda);
      if (this.mesa instanceof Loteria) this.mesa.validarTamano(this.mesa.ajustes.tam);
    } catch (e) {
      Object.assign(this, respaldo);
      return { ok: false, error: e.message };
    }
    if (this.mesa instanceof Loteria) this.mesa.alCambiarBaraja(cambio);
    this.actualizar();
    return { ok: true };
  }

  // ---------- Fin ----------
  podio(mostrar) {
    if (mostrar) this.cerrarMesa(false);
    this.fase = mostrar ? 'podio' : 'abierto';
    this.actualizar();
    return { ok: true };
  }

  cerrar() {
    this.cerrarMesa(false);
    for (const mapa of this.solos.values()) for (const s of mapa.values()) s.destruir();
    this.solos.clear();
    clearTimeout(this.timerEmision);
    this.io.to(this.codigo).emit('cerrada');
  }
}

export { CATALOGO };
