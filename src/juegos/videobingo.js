// Videobingo: 4 cartones, 30 bolas y bolas extra. En vivo todos ven el mismo sorteo en la tele;
// las bolas extra son personales (cada quien tiene su propio orden de bolas restantes).
import { Mesa, barajar, ms, azarReal } from '../util.js';
import { NUMEROS, SORTEO, MAX_EXTRA, APUESTAS, premioTotal, precioExtra, generarCartones, casiPremios } from '../../public/js/shared/videobingo.js';
import { dinero } from '../../public/js/shared/catalogo.js';

const T = { bola: 380, pagosVivo: 7000 };
const TIEMPOS = [0, 15, 20, 30, 45];
const EXTRAS = [15, 25, 40];

export class Videobingo extends Mesa {
  static juego = 'videobingo';

  static normalizar(a = {}, previo = { tiempo: 20, extras: 25 }) {
    const t = Number(a.tiempo);
    const e = Number(a.extras);
    return { tiempo: TIEMPOS.includes(t) ? t : previo.tiempo, extras: EXTRAS.includes(e) ? e : previo.extras };
  }

  constructor(casino, { solo = null, ajustes = {} } = {}) {
    super(casino, { solo });
    this.variante = 'clasico';
    this.ajustes = Videobingo.normalizar(ajustes);
    this.ronda = 1;
    this.est = new Map();
    this.historial = [];
    this.forzado = null;
    this.abrirApuestas();
  }

  e(j) {
    let s = this.est.get(j.id);
    if (!s) {
      s = { cartones: generarCartones(azarReal), activos: [true, true, true, true], apuesta: 100, comprado: false, costo: 0, costoExtras: 0, extras: [], secuencia: [], precio: null, premio: null, terminado: false, ganado: 0, resultado: null };
      this.est.set(j.id, s);
    }
    return s;
  }

  costoDe(s) {
    return s.activos.filter(Boolean).length * s.apuesta;
  }

  marcadas(s) {
    return new Set([...this.bolas, ...s.extras]);
  }

  // ---------- Fases ----------
  abrirApuestas() {
    this.fase = 'apuestas';
    this.bolas = [];
    this.orden = [];
    this.finExtrasEn = this.siguienteEn = null;
    this.ganadores = [];
    for (const s of this.est.values()) {
      Object.assign(s, { comprado: false, costo: 0, costoExtras: 0, extras: [], secuencia: [], precio: null, premio: null, terminado: false, ganado: 0 });
    }
    this.quitar('cierre');
    this.cierreEn = null;
    if (!this.solo && this.ajustes.tiempo) {
      const espera = this.ajustes.tiempo * 1000;
      this.cierreEn = Date.now() + espera;
      this.t('cierre', ms(espera), () => this.alCerrar());
    }
    this.actualizar();
  }

  compradores() {
    return [...this.est.entries()].filter(([, s]) => s.comprado);
  }

  alCerrar() {
    if (!this.compradores().length) return this.abrirApuestas();
    this.sortear();
  }

  nuevoOrden() {
    const base = barajar(Array.from({ length: NUMEROS }, (_, i) => i + 1));
    if (!this.forzado) return base;
    const f = this.forzado.filter((n) => n >= 1 && n <= NUMEROS);
    this.forzado = null;
    return [...f, ...base.filter((n) => !f.includes(n))];
  }

  sortear() {
    if (this.fase !== 'apuestas') return { ok: false, error: 'El sorteo ya empezó.' };
    if (!this.compradores().length) return { ok: false, error: 'Nadie compró cartones.' };
    this.quitar('cierre');
    this.cierreEn = null;
    this.fase = 'sorteo';
    this.orden = this.nuevoOrden();
    this.bolas = [];
    this.actualizar();
    const sacar = () => {
      const n = this.orden[this.bolas.length];
      this.bolas.push(n);
      this.evento('bola', { numero: n, i: this.bolas.length });
      this.actualizar();
      if (this.bolas.length < SORTEO) this.t('bola', ms(T.bola), sacar);
      else this.t('bola', ms(900), () => this.empezarExtras());
    };
    this.t('bola', ms(700), sacar);
    return { ok: true };
  }

  // Calcula premio y precio de bola extra para un jugador
  recalcular(s) {
    const marcadas = this.marcadas(s);
    s.premio = premioTotal(s.cartones, s.activos, s.apuesta, marcadas);
    s.precio = s.extras.length >= MAX_EXTRA ? { hay: false, precio: 0, ev: 0 } : precioExtra(s.cartones, s.activos, s.apuesta, marcadas, s.secuencia);
  }

  empezarExtras() {
    this.fase = 'extras';
    const restantes = this.orden.slice(SORTEO);
    for (const [id, s] of this.compradores()) {
      s.secuencia = barajar(restantes);
      this.recalcular(s);
      if (!s.precio.hay) this.terminar(this.solo || this.jugador(id), s, false);
    }
    if (this.todosTerminaron()) return this.cerrarRonda();
    if (!this.solo) {
      const espera = this.ajustes.extras * 1000;
      this.finExtrasEn = Date.now() + espera;
      this.t('extras', ms(espera), () => {
        for (const [id, s] of this.compradores()) if (!s.terminado) this.terminar(this.solo || this.jugador(id), s, false);
        this.cerrarRonda();
      });
    }
    this.actualizar();
  }

  todosTerminaron() {
    return this.compradores().every(([, s]) => s.terminado);
  }

  terminar(j, s, revisar = true) {
    if (s.terminado) return;
    this.recalcular(s);
    s.terminado = true;
    s.ganado = s.premio.total;
    const apostado = s.costo + s.costoExtras;
    if (j) {
      if (s.ganado) this.casino.abonar(j, s.ganado);
      const mejor = s.premio.detalle.filter(Boolean).sort((a, b) => b.pago - a.pago)[0];
      this.casino.anotar(j, s.ganado - apostado, `Videobingo: ${mejor ? mejor.nombre : 'sin premio'}${s.extras.length ? `, ${s.extras.length} bolas extra` : ''}`);
      if (s.ganado - apostado >= 10000) this.casino.anunciar(j, s.ganado - apostado, 'Videobingo');
    }
    s.resultado = { apostado, ganado: s.ganado, neto: s.ganado - apostado };
    if (revisar && this.todosTerminaron()) this.cerrarRonda();
  }

  cerrarRonda() {
    if (this.fase === 'pagos') return;
    this.quitar('extras');
    this.fase = 'pagos';
    this.finExtrasEn = null;
    this.ganadores = this.compradores()
      .map(([id, s]) => {
        const j = this.solo || this.jugador(id);
        return { id, nombre: j?.nombre || '?', avatar: j?.avatar || '', neto: s.resultado?.neto || 0, ganado: s.ganado };
      })
      .filter((g) => g.ganado > 0)
      .sort((a, b) => b.neto - a.neto);
    this.historial.unshift({ ronda: this.ronda, bolas: this.bolas.slice() });
    this.historial = this.historial.slice(0, 10);
    this.evento('pagos', { ronda: this.ronda });
    if (this.solo) {
      this.actualizar();
      return;
    }
    this.siguienteEn = Date.now() + T.pagosVivo;
    this.actualizar();
    this.t('siguiente', ms(T.pagosVivo), () => {
      this.ronda++;
      this.abrirApuestas();
    });
  }

  // ---------- Acciones ----------
  accion(j, tipo, d = {}) {
    if (this.solo && this.solo !== j) return { ok: false, error: 'Esta mesa es de otra persona.' };
    if (this.solo && this.fase === 'pagos' && ['configurar', 'cambiar', 'jugar'].includes(tipo)) {
      this.ronda++;
      this.abrirApuestas();
    }
    const s = this.e(j);
    switch (tipo) {
      case 'configurar': {
        if (this.fase !== 'apuestas' || s.comprado) return { ok: false, error: 'Ya compraste tus cartones para esta ronda.' };
        if (Array.isArray(d.activos) && d.activos.length === 4) {
          const a = d.activos.map(Boolean);
          if (!a.some(Boolean)) return { ok: false, error: 'Activa al menos un cartón.' };
          s.activos = a;
        }
        if (d.apuesta !== undefined) {
          if (!APUESTAS.includes(Number(d.apuesta))) return { ok: false, error: 'Apuesta inválida.' };
          s.apuesta = Number(d.apuesta);
        }
        this.actualizar();
        return { ok: true };
      }
      case 'cambiar': {
        if (this.fase !== 'apuestas' || s.comprado) return { ok: false, error: 'Ya compraste tus cartones.' };
        s.cartones = generarCartones(azarReal);
        this.actualizar();
        return { ok: true };
      }
      case 'comprar':
      case 'jugar': {
        if (this.fase !== 'apuestas') return { ok: false, error: 'Espera la siguiente ronda.' };
        if (s.comprado) return this.solo ? this.sortear() : { ok: true };
        const costo = this.costoDe(s);
        if (!this.casino.cobrar(j, costo)) return { ok: false, error: `Necesitas ${dinero(costo)} para estos cartones.` };
        s.comprado = true;
        s.costo = costo;
        if (this.solo) return this.sortearSolo(j, s);
        this.actualizar();
        return { ok: true };
      }
      case 'cancelar': {
        if (this.fase !== 'apuestas' || !s.comprado) return { ok: false };
        this.casino.abonar(j, s.costo);
        s.comprado = false;
        s.costo = 0;
        this.actualizar();
        return { ok: true };
      }
      case 'extra': {
        if (this.fase !== 'extras' || !s.comprado || s.terminado) return { ok: false, error: 'No hay bolas extra ahora.' };
        this.recalcular(s);
        if (!s.precio.hay) return { ok: false, error: 'Ya no hay bolas extra que ayuden.' };
        if (!this.casino.cobrar(j, s.precio.precio)) return { ok: false, error: 'No te alcanza para la bola extra.' };
        s.costoExtras += s.precio.precio;
        const n = s.secuencia.shift();
        s.extras.push(n);
        this.recalcular(s);
        if (!s.precio.hay) this.terminar(j, s);
        this.actualizar();
        return { ok: true, numero: n };
      }
      case 'cobrar': {
        if (this.fase !== 'extras' || !s.comprado || s.terminado) return { ok: false };
        this.terminar(j, s);
        this.actualizar();
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Acción desconocida.' };
    }
  }

  sortearSolo(j, s) {
    this.fase = 'sorteo';
    this.orden = this.nuevoOrden();
    this.bolas = this.orden.slice(0, SORTEO);
    this.evento('sorteo', { bolas: this.bolas });
    this.empezarExtras();
    return { ok: true };
  }

  host(tipo, d = {}) {
    if (tipo === 'sortear') return this.sortear();
    if (tipo === 'ajustes') {
      this.ajustes = Videobingo.normalizar(d, this.ajustes);
      if (this.fase === 'apuestas') {
        this.quitar('cierre');
        this.cierreEn = null;
        if (this.ajustes.tiempo) {
          this.cierreEn = Date.now() + this.ajustes.tiempo * 1000;
          this.t('cierre', ms(this.ajustes.tiempo * 1000), () => this.alCerrar());
        }
        this.actualizar();
      }
      return { ok: true };
    }
    if (tipo === 'prueba') {
      if (Array.isArray(d.bolas)) this.forzado = d.bolas.map(Number);
      return { ok: true };
    }
    return { ok: false, error: 'Acción desconocida.' };
  }

  cancelar() {
    for (const [id, s] of this.est) {
      const j = this.solo || this.jugador(id);
      if (!j || !s.comprado || s.terminado) continue;
      this.casino.abonar(j, s.costo + s.costoExtras);
    }
  }

  // ---------- Estado ----------
  publico() {
    return {
      variante: this.variante,
      fase: this.fase,
      ronda: this.ronda,
      ajustes: this.ajustes,
      cierreEn: this.cierreEn,
      finExtrasEn: this.finExtrasEn,
      siguienteEn: this.siguienteEn,
      bolas: this.bolas,
      participantes: this.compradores().map(([id, s]) => {
        const j = this.solo || this.jugador(id);
        return { id, nombre: j?.nombre || '?', avatar: j?.avatar || '', cartones: s.activos.filter(Boolean).length, apuesta: s.apuesta, premio: s.premio?.total ?? null, extras: s.extras.length, terminado: s.terminado, ganado: s.ganado };
      }),
      ganadores: this.ganadores,
    };
  }

  privado(j) {
    const s = this.e(j);
    const marcadas = this.marcadas(s);
    const enJuego = s.comprado && this.fase !== 'apuestas';
    return {
      cartones: s.cartones,
      activos: s.activos,
      apuesta: s.apuesta,
      costo: this.costoDe(s),
      comprado: s.comprado,
      extras: s.extras,
      premio: enJuego ? premioTotal(s.cartones, s.activos, s.apuesta, marcadas) : null,
      precio: this.fase === 'extras' && !s.terminado ? s.precio : null,
      casi: enJuego && !s.terminado ? casiPremios(s.cartones, s.activos, s.apuesta, marcadas) : [],
      terminado: s.terminado,
      resultado: s.resultado,
      quedanExtras: MAX_EXTRA - s.extras.length,
    };
  }
}
