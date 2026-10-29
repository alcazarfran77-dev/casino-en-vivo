// Lotería dentro del casino: misma lógica que la app original, con jugadores del casino
// y un pozo opcional (cada tabla cuesta una entrada; quien llena su tabla se lleva el pozo).
import { Mesa, rid, barajar, ms, texto, color, entero } from '../util.js';
import { evaluarTabla, completadaEn, modosDisponibles } from '../../public/js/shared/reglas.js';
import { dinero } from '../../public/js/shared/catalogo.js';

export const AJUSTES_LOTERIA = {
  tam: 4,
  modo: 'llena',
  maxTablas: 4,
  velocidad: 6,
  victoria: 'auto',
  marcado: 'manual',
  reinicio: 0,
  mostrarFaltantes: true,
  permitirArmar: true,
  cantarVerso: true,
  precio: 0,
};
export const PRECIOS_TABLA = [0, 500, 1000, 2500, 5000];
const MAX_IMG_BYTES = 2.5 * 1024 * 1024;
const BLOQUEO_FALSA_MS = 8000;
const BARAJANDO_MS = 2600;

export function normalizarAjustesLoteria(a = {}, previo = AJUSTES_LOTERIA) {
  const r = { ...previo };
  if (a.tam !== undefined) r.tam = [3, 4, 5].includes(Number(a.tam)) ? Number(a.tam) : previo.tam;
  if (a.modo !== undefined) r.modo = String(a.modo);
  if (!modosDisponibles(r.tam).includes(r.modo)) r.modo = 'llena';
  if (a.maxTablas !== undefined) r.maxTablas = entero(a.maxTablas, 1, 6, previo.maxTablas);
  if (a.velocidad !== undefined) {
    const v = entero(a.velocidad, 0, 30, previo.velocidad);
    r.velocidad = v === 0 ? 0 : Math.max(2, v);
  }
  if (a.victoria !== undefined) r.victoria = a.victoria === 'grito' ? 'grito' : 'auto';
  if (a.marcado !== undefined) r.marcado = a.marcado === 'auto' ? 'auto' : 'manual';
  if (a.reinicio !== undefined) r.reinicio = entero(a.reinicio, 0, 600, previo.reinicio);
  if (a.precio !== undefined) r.precio = PRECIOS_TABLA.includes(Number(a.precio)) ? Number(a.precio) : previo.precio;
  for (const k of ['mostrarFaltantes', 'permitirArmar', 'cantarVerso']) if (a[k] !== undefined) r[k] = Boolean(a[k]);
  return r;
}

function decodificarImagen(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_IMG_BYTES) return null;
  return { mime: m[1], buf };
}

// Limpia la baraja enviada por el anfitrión. Devuelve { baraja, imagenes } o lanza Error.
export function normalizarBaraja(b) {
  if (!b || !Array.isArray(b.cartas)) throw new Error('Baraja inválida');
  if (b.cartas.length < 9) throw new Error('La baraja necesita al menos 9 cartas');
  if (b.cartas.length > 200) throw new Error('La baraja admite máximo 200 cartas');
  const imagenes = new Map();
  const vistos = new Set();
  const cartas = b.cartas.map((c, i) => {
    let id = texto(c.id, 24) || 'x' + i;
    if (!/^[A-Za-z0-9_-]+$/.test(id) || vistos.has(id)) id = 'x' + i + rid(3);
    vistos.add(id);
    const img = decodificarImagen(c.img);
    if (img) imagenes.set(id, img);
    return { id, nombre: texto(c.nombre, 40, `Carta ${i + 1}`) || `Carta ${i + 1}`, verso: texto(c.verso, 160), arte: texto(c.arte, 24), color: color(c.color, undefined), img: Boolean(img) };
  });
  const rev = b.reverso || {};
  const revImg = decodificarImagen(rev.img);
  if (revImg) imagenes.set('reverso', revImg);
  const enc = b.encabezado || {};
  const encImg = decodificarImagen(enc.img);
  if (encImg) imagenes.set('encabezado', encImg);
  return {
    baraja: {
      nombre: texto(b.nombre, 60, 'Mi baraja') || 'Mi baraja',
      cartas,
      reverso: { texto: texto(rev.texto, 24, 'LOTERÍA'), color1: color(rev.color1, '#7A1450'), color2: color(rev.color2, '#1F5BB5'), img: Boolean(revImg) },
      encabezado: { texto: texto(enc.texto, 24, 'LOTERÍA'), subtitulo: texto(enc.subtitulo, 48), color: color(enc.color, '#E4007C'), img: Boolean(encImg) },
      estiloImagen: b.estiloImagen === 'completa' ? 'completa' : 'arte',
    },
    imagenes,
  };
}

export class Loteria extends Mesa {
  static juego = 'loteria';

  constructor(casino, { ajustes = {} } = {}) {
    super(casino);
    this.variante = 'tradicional';
    this.ajustes = normalizarAjustesLoteria(ajustes);
    this.validarTamano(this.ajustes.tam);
    this.fase = 'lobby'; // lobby | barajando | jugando | fin
    this.pausado = false;
    this.partida = 0;
    this.orden = [];
    this.cantadas = [];
    this.cantadasSet = new Set();
    this.ganadores = [];
    this.motivoFin = null;
    this.proximaCartaEn = null;
    this.proximaPartidaEn = null;
    this.est = new Map();
    this.pozo = 0;
    this.entradas = new Map();
  }

  get baraja() {
    return this.casino.baraja;
  }
  idsCartas() {
    return this.baraja.cartas.map((c) => c.id);
  }
  validarTamano(tam) {
    const n2 = tam * tam;
    if (this.baraja.cartas.length < n2) throw new Error(`Para tablas de ${tam}×${tam} la baraja necesita al menos ${n2} cartas`);
  }
  generarTabla() {
    const n2 = this.ajustes.tam * this.ajustes.tam;
    return { id: rid(6), celdas: barajar(this.idsCartas()).slice(0, n2) };
  }

  e(j) {
    let s = this.est.get(j.id);
    if (!s) {
      s = { tablas: [], marcas: new Map(), ofertas: new Map(), activo: false, victorias: 0, bloqueadoHasta: 0 };
      this.est.set(j.id, s);
      this.llenarOfertas(s);
    }
    return s;
  }

  puedeElegir(s) {
    return this.fase === 'lobby' || this.fase === 'fin' || !s.activo;
  }

  llenarOfertas(s, cantidad = 6) {
    s.ofertas = new Map();
    for (let i = 0; i < cantidad; i++) {
      const t = this.generarTabla();
      s.ofertas.set(t.id, t);
    }
    for (const t of s.tablas) s.ofertas.set(t.id, t);
  }

  faltanDe(s) {
    if (!s.activo || this.fase === 'lobby') return null;
    let min = Infinity;
    for (const t of s.tablas) {
      const r = evaluarTabla(t.celdas, this.cantadasSet, this.ajustes.modo, this.ajustes.tam);
      if (r.faltan < min) min = r.faltan;
    }
    return Number.isFinite(min) ? min : null;
  }

  // ---------- Estado ----------
  publico() {
    const participantes = [];
    for (const [id, s] of this.est) {
      const j = this.jugador(id);
      if (!j || j.expulsado || (!s.tablas.length && !s.activo)) continue;
      participantes.push({ id, nombre: j.nombre, avatar: j.avatar, conectado: j.conectado, tablas: s.tablas.length, activo: s.activo, faltan: this.ajustes.mostrarFaltantes ? this.faltanDe(s) : null, victorias: s.victorias });
    }
    return {
      variante: this.variante,
      fase: this.fase,
      pausado: this.pausado,
      ajustes: this.ajustes,
      baraja: { version: this.casino.versionBaraja, total: this.baraja.cartas.length, nombre: this.baraja.nombre },
      partida: this.partida,
      cantadas: this.cantadas,
      actual: this.cantadas.length ? this.cantadas[this.cantadas.length - 1] : null,
      proximaCartaEn: this.proximaCartaEn,
      proximaPartidaEn: this.proximaPartidaEn,
      ganadores: this.ganadores,
      motivoFin: this.motivoFin,
      participantes,
      pozo: this.pozo,
    };
  }

  privado(j) {
    const s = this.e(j);
    return {
      activo: s.activo,
      tablas: s.tablas,
      marcas: Object.fromEntries([...s.marcas].map(([k, v]) => [k, [...v]])),
      ofertas: [...s.ofertas.values()],
      bloqueadoHasta: s.bloqueadoHasta,
      entrada: this.entradas.get(j.id) || 0,
    };
  }

  // ---------- Jugador ----------
  accion(j, tipo, d = {}) {
    const s = this.e(j);
    switch (tipo) {
      case 'ofertas':
        if (!this.puedeElegir(s)) return { ok: false, error: 'Espera a que termine la partida para cambiar de tabla.' };
        this.llenarOfertas(s);
        this.actualizar();
        return { ok: true };
      case 'armar': {
        if (!this.ajustes.permitirArmar) return { ok: false, error: 'El anfitrión no permite armar tablas propias.' };
        if (!this.puedeElegir(s)) return { ok: false, error: 'Espera a que termine la partida.' };
        const n2 = this.ajustes.tam * this.ajustes.tam;
        const ids = new Set(this.idsCartas());
        const celdas = d.celdas;
        if (!Array.isArray(celdas) || celdas.length !== n2) return { ok: false, error: `Tu tabla necesita ${n2} figuras.` };
        if (new Set(celdas).size !== n2 || !celdas.every((c) => ids.has(c))) return { ok: false, error: 'Cada figura debe ser distinta y de esta baraja.' };
        const t = { id: rid(6), celdas: [...celdas], propia: true };
        s.ofertas.set(t.id, t);
        this.actualizar();
        return { ok: true, tablaId: t.id };
      }
      case 'elegir': {
        if (!this.puedeElegir(s)) return { ok: false, error: 'Espera a que termine la partida para cambiar de tabla.' };
        if (!Array.isArray(d.ids)) return { ok: false, error: 'Selección inválida.' };
        const unicos = [...new Set(d.ids)].slice(0, this.ajustes.maxTablas);
        const tablas = [];
        for (const id of unicos) {
          const t = s.ofertas.get(id) || s.tablas.find((x) => x.id === id);
          if (!t) return { ok: false, error: 'Esa tabla ya no está disponible, pide otras.' };
          tablas.push(t);
        }
        s.tablas = tablas;
        s.marcas = new Map(tablas.map((t) => [t.id, new Set()]));
        this.actualizar();
        return { ok: true };
      }
      case 'marcar': {
        const t = s.tablas.find((x) => x.id === d.tablaId);
        if (!t || !s.activo || this.fase !== 'jugando') return { ok: false };
        const idx = Number(d.i);
        if (!Number.isInteger(idx) || idx < 0 || idx >= t.celdas.length) return { ok: false };
        const set = s.marcas.get(t.id) || new Set();
        if (d.puesto) {
          if (!this.cantadasSet.has(t.celdas[idx])) return { ok: false, error: 'Esa carta todavía no sale.' };
          set.add(idx);
        } else set.delete(idx);
        s.marcas.set(t.id, set);
        return { ok: true };
      }
      case 'loteria':
        return this.reclamar(j, s);
      default:
        return { ok: false, error: 'Acción desconocida.' };
    }
  }

  reclamar(j, s) {
    if (this.fase !== 'jugando') return { ok: false, error: 'No hay partida en curso.' };
    if (!s.activo) return { ok: false, error: 'No estás jugando esta partida.' };
    const ahora = Date.now();
    if (ahora < s.bloqueadoHasta) return { ok: false, error: `Espera ${Math.ceil((s.bloqueadoHasta - ahora) / 1000)} s para volver a cantar.` };
    for (const t of s.tablas) {
      const r = evaluarTabla(t.celdas, this.cantadasSet, this.ajustes.modo, this.ajustes.tam);
      if (r.gana) {
        this.terminar([this.registroGanador(j, t, r.patron)], 'loteria');
        return { ok: true };
      }
    }
    s.bloqueadoHasta = ahora + BLOQUEO_FALSA_MS;
    this.evento('falsa', { nombre: j.nombre });
    this.actualizar();
    return { ok: false, falsa: true, error: '¡Lotería falsa! Todavía no completas tu tabla.' };
  }

  // ---------- Anfitrión ----------
  host(tipo, d = {}) {
    switch (tipo) {
      case 'iniciar':
        return this.iniciar();
      case 'siguiente':
        if (this.fase !== 'jugando') return { ok: false, error: 'No hay partida en curso.' };
        this.cantar();
        return { ok: true };
      case 'pausa':
        if (this.fase !== 'jugando') return { ok: false };
        this.pausado = Boolean(d.pausa);
        if (this.pausado) {
          this.quitar('carta');
          this.proximaCartaEn = null;
        } else this.programarSiguiente();
        this.actualizar();
        return { ok: true };
      case 'terminar':
        if (this.fase !== 'jugando' && this.fase !== 'barajando') return { ok: false };
        this.terminar([], 'anfitrion');
        return { ok: true };
      case 'cancelarReinicio':
        this.quitar('reinicio');
        this.proximaPartidaEn = null;
        this.actualizar();
        return { ok: true };
      case 'ajustes':
        return this.cambiarAjustes(d);
      case 'prueba':
        if (Array.isArray(d.orden)) this.ordenForzado = d.orden.map(String);
        return { ok: true };
      default:
        return { ok: false, error: 'Acción desconocida.' };
    }
  }

  cambiarAjustes(a) {
    const previo = this.ajustes;
    const enJuego = this.fase === 'jugando' || this.fase === 'barajando';
    const nuevos = normalizarAjustesLoteria(a, previo);
    if (enJuego) {
      this.ajustes = { ...previo, velocidad: nuevos.velocidad, cantarVerso: nuevos.cantarVerso, mostrarFaltantes: nuevos.mostrarFaltantes };
      if (previo.velocidad !== this.ajustes.velocidad && this.fase === 'jugando') this.programarSiguiente();
    } else {
      try {
        this.validarTamano(nuevos.tam);
      } catch (e) {
        return { ok: false, error: e.message };
      }
      this.ajustes = nuevos;
      if (nuevos.tam !== previo.tam) this.reiniciarTablas('Cambió el tamaño de tabla: elige tus tablas de nuevo.');
      else if (nuevos.maxTablas < previo.maxTablas) for (const s of this.est.values()) s.tablas = s.tablas.slice(0, nuevos.maxTablas);
      if (previo.reinicio !== nuevos.reinicio && this.fase === 'fin') this.programarReinicio();
    }
    this.actualizar();
    return { ok: true };
  }

  // Se llama cuando el anfitrión cambia la baraja del casino
  alCambiarBaraja(cambioIds) {
    if (cambioIds) this.reiniciarTablas('El anfitrión cambió la baraja: elige tus tablas de nuevo.');
    this.cantadas = [];
    this.cantadasSet = new Set();
    this.actualizar();
  }

  reiniciarTablas(aviso) {
    for (const [id, s] of this.est) {
      s.tablas = [];
      s.marcas = new Map();
      s.activo = false;
      this.llenarOfertas(s);
      const j = this.jugador(id);
      if (j) this.casino.avisar(j, aviso);
    }
  }

  iniciar() {
    if (this.fase === 'jugando' || this.fase === 'barajando') return { ok: false, error: 'Ya hay una partida en curso.' };
    this.quitar('carta');
    this.quitar('reinicio');
    this.proximaPartidaEn = null;
    this.proximaCartaEn = null;
    this.partida++;
    this.orden = this.ordenForzado?.length ? [...this.ordenForzado, ...barajar(this.idsCartas()).filter((x) => !this.ordenForzado.includes(x))] : barajar(this.idsCartas());
    this.ordenForzado = null;
    this.cantadas = [];
    this.cantadasSet = new Set();
    this.ganadores = [];
    this.motivoFin = null;
    this.pausado = false;
    this.pozo = 0;
    this.entradas = new Map();
    for (const [id, s] of this.est) {
      const j = this.jugador(id);
      s.activo = false;
      s.marcas = new Map(s.tablas.map((t) => [t.id, new Set()]));
      s.bloqueadoHasta = 0;
      if (!j || j.expulsado || !s.tablas.length) continue;
      const costo = this.ajustes.precio * s.tablas.length;
      if (costo > 0) {
        if (!this.casino.cobrar(j, costo)) {
          this.casino.avisar(j, `No te alcanzó el saldo para ${s.tablas.length === 1 ? 'tu tabla' : 'tus tablas'} (${dinero(costo)}). Juegas la siguiente.`);
          continue;
        }
        this.entradas.set(id, costo);
        this.pozo += costo;
      }
      s.activo = true;
    }
    this.fase = 'barajando';
    this.actualizar();
    this.t('barajar', ms(BARAJANDO_MS), () => {
      this.fase = 'jugando';
      this.cantar();
    });
    return { ok: true };
  }

  cantar() {
    if (this.fase !== 'jugando') return;
    this.quitar('carta');
    this.proximaCartaEn = null;
    if (this.cantadas.length >= this.orden.length) return this.finDeMazo();
    const id = this.orden[this.cantadas.length];
    this.cantadas.push(id);
    this.cantadasSet.add(id);
    this.evento('carta', { id, numero: this.cantadas.length, partida: this.partida });
    if (this.ajustes.victoria === 'auto') {
      const ganadores = [];
      for (const [jid, s] of this.est) {
        if (!s.activo) continue;
        const j = this.jugador(jid);
        if (!j) continue;
        for (const t of s.tablas) {
          const r = evaluarTabla(t.celdas, this.cantadasSet, this.ajustes.modo, this.ajustes.tam);
          if (r.gana) {
            ganadores.push(this.registroGanador(j, t, r.patron));
            break;
          }
        }
      }
      if (ganadores.length) return this.terminar(ganadores, 'loteria');
    }
    if (this.cantadas.length >= this.orden.length && this.ajustes.velocidad === 0) return this.finDeMazo();
    this.programarSiguiente();
    this.actualizar();
  }

  programarSiguiente() {
    this.quitar('carta');
    this.proximaCartaEn = null;
    if (this.fase !== 'jugando' || this.pausado || this.ajustes.velocidad === 0) return;
    const espera = this.ajustes.velocidad * 1000;
    this.proximaCartaEn = Date.now() + espera;
    this.t('carta', ms(espera), () => this.cantar());
  }

  finDeMazo() {
    const posicion = new Map(this.cantadas.map((id, i) => [id, i + 1]));
    let mejor = Infinity;
    let ganadores = [];
    for (const [jid, s] of this.est) {
      if (!s.activo) continue;
      const j = this.jugador(jid);
      if (!j) continue;
      for (const t of s.tablas) {
        const r = completadaEn(t.celdas, posicion, this.ajustes.modo, this.ajustes.tam);
        if (r.en < mejor) {
          mejor = r.en;
          ganadores = [this.registroGanador(j, t, r.patron)];
        } else if (r.en === mejor && Number.isFinite(r.en) && !ganadores.some((g) => g.jugadorId === j.id)) ganadores.push(this.registroGanador(j, t, r.patron));
      }
    }
    this.terminar(ganadores, 'mazo');
  }

  registroGanador(j, t, patron) {
    return { jugadorId: j.id, nombre: j.nombre, avatar: j.avatar, tablaId: t.id, celdas: t.celdas, patron };
  }

  terminar(ganadores, motivo) {
    this.quitar('carta');
    this.quitar('barajar');
    this.proximaCartaEn = null;
    this.fase = 'fin';
    this.pausado = false;
    this.ganadores = ganadores;
    this.motivoFin = motivo;
    // Reparto del pozo
    if (this.pozo > 0) {
      if (ganadores.length) {
        const parte = Math.floor(this.pozo / ganadores.length);
        let resto = this.pozo - parte * ganadores.length;
        const ids = new Set(ganadores.map((g) => g.jugadorId));
        for (const g of ganadores) {
          const j = this.jugador(g.jugadorId);
          const premio = parte + resto;
          resto = 0;
          g.premio = premio;
          if (j) {
            this.casino.abonar(j, premio);
            const neto = premio - (this.entradas.get(g.jugadorId) || 0);
            this.casino.anotar(j, neto, `Lotería: ¡ganaste el pozo de ${dinero(this.pozo)}!`);
            if (neto >= 10000) this.casino.anunciar(j, neto, 'Lotería');
          }
        }
        for (const [id, costo] of this.entradas) {
          if (ids.has(id)) continue;
          const j = this.jugador(id);
          if (j) this.casino.anotar(j, -costo, `Lotería: ganó ${ganadores.map((g) => g.nombre).join(' y ')}`);
        }
      } else {
        for (const [id, costo] of this.entradas) {
          const j = this.jugador(id);
          if (j) this.casino.abonar(j, costo);
        }
      }
    }
    for (const g of ganadores) {
      const s = this.est.get(g.jugadorId);
      if (s) s.victorias++;
    }
    this.programarReinicio();
    this.evento('fin', { ganadores, motivo, partida: this.partida, pozo: this.pozo });
    this.actualizar();
  }

  programarReinicio() {
    this.quitar('reinicio');
    this.proximaPartidaEn = null;
    if (this.fase !== 'fin' || !this.ajustes.reinicio) return;
    const espera = this.ajustes.reinicio * 1000;
    this.proximaPartidaEn = Date.now() + espera;
    this.t('reinicio', ms(espera), () => this.iniciar());
  }

  cancelar() {
    if ((this.fase === 'jugando' || this.fase === 'barajando') && this.pozo > 0) {
      for (const [id, costo] of this.entradas) {
        const j = this.jugador(id);
        if (j) this.casino.abonar(j, costo);
      }
    }
    this.pozo = 0;
    this.entradas = new Map();
  }
}
