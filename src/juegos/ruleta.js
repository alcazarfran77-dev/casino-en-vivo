// Mesa de ruleta: americana, europea o francesa. En vivo (tele) o individual (celular).
import { Mesa, azar, ms } from '../util.js';
import { VARIANTES, apuestasValidas, retorno, expandirAnunciada, casillas, MAX_POR_APUESTA, MAX_POR_RONDA, FICHAS, etiqueta, colorDe } from '../../public/js/shared/ruleta.js';
import { dinero } from '../../public/js/shared/catalogo.js';

const GIRO_VIVO = 8500;
const GIRO_SOLO = 5200;
const PAGOS_VIVO = 6500;
const TIEMPOS = [0, 10, 15, 20, 30, 45];
const COLOR_ES = { rojo: 'rojo', negro: 'negro', verde: 'verde' };

export class Ruleta extends Mesa {
  static juego = 'ruleta';

  static normalizar(a = {}, previo = { tiempo: 20 }) {
    const t = Number(a.tiempo);
    return { tiempo: TIEMPOS.includes(t) ? t : previo.tiempo };
  }

  constructor(casino, { variante = 'europea', solo = null, ajustes = {} } = {}) {
    super(casino, { solo });
    if (!VARIANTES[variante]) throw new Error('Variante de ruleta desconocida');
    this.variante = variante;
    this.V = VARIANTES[variante];
    this.validas = apuestasValidas(variante);
    this.pockets = casillas(variante);
    this.ajustes = Ruleta.normalizar(ajustes);
    this.ronda = 1;
    this.apuestas = new Map(); // id → Map(clave → monto)
    this.pila = new Map(); // id → [[{clave, monto}]] para deshacer
    this.ultimas = new Map(); // id → [{clave, monto}] de la ronda anterior
    this.liquidacion = new Map(); // id → { ronda, apostado, ganado }
    this.resultado = null;
    this.historial = [];
    this.ganadores = [];
    this.forzado = null;
    this.abrirApuestas();
  }

  // ---------- Fases ----------
  abrirApuestas() {
    this.fase = 'apuestas';
    this.finGiroEn = null;
    this.siguienteEn = null;
    this.quitar('cierre');
    this.cierreEn = null;
    if (!this.solo && this.ajustes.tiempo) {
      const espera = this.ajustes.tiempo * 1000;
      this.cierreEn = Date.now() + espera;
      this.t('cierre', ms(espera), () => this.alCerrar());
    }
    this.actualizar();
  }

  alCerrar() {
    if (this.totalMesa() === 0) return this.abrirApuestas(); // nadie apostó: se vuelve a abrir sin girar
    this.girar();
  }

  girar() {
    if (this.fase !== 'apuestas') return { ok: false, error: 'La rueda ya está girando.' };
    this.quitar('cierre');
    this.cierreEn = null;
    this.fase = 'girando';
    this.resultado = this.forzado ?? this.pockets[azar(this.pockets.length)];
    this.forzado = null;
    const duracion = this.solo ? GIRO_SOLO : GIRO_VIVO;
    this.finGiroEn = Date.now() + duracion;
    this.evento('giro', { resultado: this.resultado, duracion, ronda: this.ronda });
    this.actualizar();
    this.t('giro', ms(duracion), () => this.liquidar());
    return { ok: true };
  }

  liquidar() {
    const res = this.resultado;
    const ganadores = [];
    for (const [id, mapa] of this.apuestas) {
      const j = this.solo || this.jugador(id);
      let apostado = 0;
      let ganado = 0;
      for (const [clave, monto] of mapa) {
        apostado += monto;
        ganado += retorno(this.validas.get(clave), monto, res, this.variante);
      }
      if (!j) continue;
      if (ganado > 0) this.casino.abonar(j, ganado);
      const neto = ganado - apostado;
      this.casino.anotar(j, neto, `${this.V.nombre}: salió ${etiqueta(res)} ${COLOR_ES[colorDe(res)]}`);
      this.liquidacion.set(id, { ronda: this.ronda, apostado, ganado, resultado: res });
      if (neto > 0) ganadores.push({ id, nombre: j.nombre, avatar: j.avatar, neto, ganado });
      if (neto >= 10000) this.casino.anunciar(j, neto, this.V.nombre);
      this.ultimas.set(id, [...mapa].map(([clave, monto]) => ({ clave, monto })));
    }
    this.ganadores = ganadores.sort((a, b) => b.neto - a.neto).slice(0, 10);
    this.historial.unshift(res);
    this.historial = this.historial.slice(0, 120);
    this.apuestas = new Map();
    this.pila = new Map();
    this.fase = 'pagos';
    this.finGiroEn = null;
    this.evento('resultado', { resultado: res, ronda: this.ronda, ganadores: this.ganadores });
    if (this.solo) {
      // En modo individual se queda mostrando el resultado hasta la siguiente apuesta
      this.siguienteEn = null;
      this.actualizar();
      return;
    }
    this.siguienteEn = Date.now() + PAGOS_VIVO;
    this.actualizar();
    this.t('siguiente', ms(PAGOS_VIVO), () => {
      this.ronda++;
      this.abrirApuestas();
    });
  }

  nuevaRondaSolo() {
    if (this.solo && this.fase === 'pagos') {
      this.ronda++;
      this.abrirApuestas();
    }
  }

  // ---------- Dinero en la mesa ----------
  totalDe(id) {
    let t = 0;
    for (const m of this.apuestas.get(id)?.values() || []) t += m;
    return t;
  }
  totalMesa() {
    let t = 0;
    for (const id of this.apuestas.keys()) t += this.totalDe(id);
    return t;
  }

  colocar(j, items) {
    if (!items?.length) return { ok: false, error: 'Apuesta inválida.' };
    const mapa = this.apuestas.get(j.id) || new Map();
    let costo = 0;
    const suma = new Map();
    for (const it of items) {
      const d = this.validas.get(it.clave);
      if (!d || !Number.isInteger(it.monto) || it.monto <= 0) return { ok: false, error: 'Esa apuesta no existe en esta mesa.' };
      suma.set(it.clave, (suma.get(it.clave) || 0) + it.monto);
      costo += it.monto;
    }
    for (const [clave, m] of suma) {
      if ((mapa.get(clave) || 0) + m > MAX_POR_APUESTA) return { ok: false, error: `Máximo ${dinero(MAX_POR_APUESTA)} por casilla.` };
    }
    if (this.totalDe(j.id) + costo > MAX_POR_RONDA) return { ok: false, error: `Máximo ${dinero(MAX_POR_RONDA)} por ronda.` };
    if (!this.casino.cobrar(j, costo)) return { ok: false, error: 'No te alcanza el saldo.' };
    for (const [clave, m] of suma) mapa.set(clave, (mapa.get(clave) || 0) + m);
    this.apuestas.set(j.id, mapa);
    const pila = this.pila.get(j.id) || [];
    pila.push([...suma].map(([clave, monto]) => ({ clave, monto })));
    this.pila.set(j.id, pila);
    this.actualizar();
    return { ok: true };
  }

  devolver(j, items) {
    const mapa = this.apuestas.get(j.id);
    if (!mapa) return;
    let total = 0;
    for (const { clave, monto } of items) {
      const actual = mapa.get(clave) || 0;
      const m = Math.min(actual, monto);
      if (m <= 0) continue;
      total += m;
      if (actual - m > 0) mapa.set(clave, actual - m);
      else mapa.delete(clave);
    }
    if (!mapa.size) this.apuestas.delete(j.id);
    if (total) this.casino.abonar(j, total);
  }

  // ---------- Acciones ----------
  accion(j, tipo, d = {}) {
    if (this.solo && this.solo !== j) return { ok: false, error: 'Esta mesa es de otra persona.' };
    if (this.solo && this.fase === 'pagos' && ['apostar', 'repetir', 'doblar'].includes(tipo)) this.nuevaRondaSolo();
    const abierta = this.fase === 'apuestas';
    switch (tipo) {
      case 'apostar': {
        if (!abierta) return { ok: false, error: 'No va más: espera la siguiente ronda.' };
        const ficha = Number(d.ficha);
        if (!FICHAS.includes(ficha)) return { ok: false, error: 'Ficha inválida.' };
        let items;
        if (d.anunciada) {
          items = expandirAnunciada(String(d.anunciada), ficha, this.variante, Number(d.numero));
          if (!items) return { ok: false, error: 'Esa apuesta anunciada no existe en esta mesa.' };
        } else items = [{ clave: String(d.clave), monto: ficha }];
        return this.colocar(j, items);
      }
      case 'deshacer': {
        if (!abierta) return { ok: false };
        const pila = this.pila.get(j.id);
        const ultimo = pila?.pop();
        if (!ultimo) return { ok: false, error: 'No hay nada que deshacer.' };
        this.devolver(j, ultimo);
        this.actualizar();
        return { ok: true };
      }
      case 'limpiar': {
        if (!abierta) return { ok: false };
        const mapa = this.apuestas.get(j.id);
        if (mapa) this.devolver(j, [...mapa].map(([clave, monto]) => ({ clave, monto })));
        this.pila.delete(j.id);
        this.actualizar();
        return { ok: true };
      }
      case 'repetir': {
        if (!abierta) return { ok: false, error: 'No va más.' };
        const ult = this.ultimas.get(j.id);
        if (!ult?.length) return { ok: false, error: 'No hay apuesta anterior.' };
        return this.colocar(j, ult);
      }
      case 'doblar': {
        if (!abierta) return { ok: false, error: 'No va más.' };
        const mapa = this.apuestas.get(j.id);
        if (!mapa?.size) return { ok: false, error: 'Primero pon una apuesta.' };
        return this.colocar(j, [...mapa].map(([clave, monto]) => ({ clave, monto })));
      }
      case 'girar': {
        if (!this.solo) return { ok: false, error: 'En la mesa en vivo gira el anfitrión.' };
        if (!this.totalDe(j.id)) return { ok: false, error: 'Pon al menos una ficha.' };
        return this.girar();
      }
      default:
        return { ok: false, error: 'Acción desconocida.' };
    }
  }

  host(tipo, d = {}) {
    if (tipo === 'girar') return this.girar();
    if (tipo === 'ajustes') {
      this.ajustes = Ruleta.normalizar(d, this.ajustes);
      if (this.fase === 'apuestas') this.abrirApuestas();
      return { ok: true };
    }
    if (tipo === 'prueba') {
      if (this.pockets.includes(Number(d.resultado))) this.forzado = Number(d.resultado);
      return { ok: true };
    }
    return { ok: false, error: 'Acción desconocida.' };
  }

  cancelar() {
    for (const [id, mapa] of this.apuestas) {
      const j = this.solo || this.jugador(id);
      if (j) this.devolver(j, [...mapa].map(([clave, monto]) => ({ clave, monto })));
    }
    this.apuestas = new Map();
  }

  // ---------- Estado ----------
  publico() {
    const porJugador = [...this.apuestas.keys()]
      .map((id) => {
        const j = this.solo || this.jugador(id);
        return { id, nombre: j?.nombre || '?', avatar: j?.avatar || '', total: this.totalDe(id) };
      })
      .sort((a, b) => b.total - a.total);
    return {
      variante: this.variante,
      fase: this.fase,
      ronda: this.ronda,
      ajustes: this.ajustes,
      cierreEn: this.cierreEn,
      finGiroEn: this.finGiroEn,
      siguienteEn: this.siguienteEn,
      // Mientras gira no se revela: la animación usa el evento 'giro'
      resultado: this.fase === 'girando' ? null : this.resultado,
      historial: this.historial.slice(0, 60),
      ganadores: this.ganadores,
      mesa: { total: this.totalMesa(), jugadores: porJugador.length, porJugador: porJugador.slice(0, 16) },
    };
  }

  privado(j) {
    const mapa = this.apuestas.get(j.id);
    const liq = this.liquidacion.get(j.id);
    return {
      apuestas: mapa ? [...mapa].map(([clave, monto]) => ({ clave, monto })) : [],
      total: this.totalDe(j.id),
      ultimo: liq || null,
      puedeRepetir: Boolean(this.ultimas.get(j.id)?.length),
      puedeDeshacer: Boolean(this.pila.get(j.id)?.length),
    };
  }
}
