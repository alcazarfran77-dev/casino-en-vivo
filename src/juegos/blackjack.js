// Mesa de blackjack: americano o Premium. Todos juegan a la vez contra el mismo crupier.
import { Mesa, barajar, ms } from '../util.js';
import { VARIANTES, mazos, total, esBlackjack, crupierPide, valorDe, rangoDe, paresPerfectos, veintiunoMasTres, textoTotal, FICHAS, MAX_LATERAL } from '../../public/js/shared/blackjack.js';
import { dinero } from '../../public/js/shared/catalogo.js';

const T = { reparto: 1600, carta: 850, pagosVivo: 7000, seguroVivo: 12000 };
const TIEMPOS = [0, 10, 15, 20, 30];
const TURNOS = [15, 20, 30, 45];
const ZONAS = ['principal', 'pares', 'tresYmas'];

export class Blackjack extends Mesa {
  static juego = 'blackjack';

  static normalizar(a = {}, previo = { tiempo: 15, turno: 30 }) {
    const t = Number(a.tiempo);
    const u = Number(a.turno);
    return { tiempo: TIEMPOS.includes(t) ? t : previo.tiempo, turno: TURNOS.includes(u) ? u : previo.turno };
  }

  constructor(casino, { variante = 'americano', solo = null, ajustes = {} } = {}) {
    super(casino, { solo });
    if (!VARIANTES[variante]) throw new Error('Variante de blackjack desconocida');
    this.variante = variante;
    this.R = VARIANTES[variante];
    this.ajustes = Blackjack.normalizar(ajustes);
    this.ronda = 1;
    this.ultimas = new Map();
    this.historial = [];
    this.forzadas = [];
    this.barajar();
    this.abrirApuestas();
  }

  barajar() {
    this.zapato = barajar(mazos(this.R.mazos));
    this.corte = Math.floor(this.zapato.length * 0.25);
    this.barajado = true;
  }
  sacar() {
    if (this.forzadas.length) return this.forzadas.shift();
    if (!this.zapato.length) this.barajar();
    return this.zapato.pop();
  }

  // ---------- Fases ----------
  abrirApuestas() {
    this.fase = 'apuestas';
    this.asientos = new Map();
    this.crupier = { cartas: [], oculta: true };
    this.finTurnoEn = this.finSeguroEn = this.siguienteEn = null;
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
    if (![...this.asientos.values()].some((a) => a.apuesta >= this.R.min)) return this.abrirApuestas();
    this.repartir();
  }

  asiento(j, crear = true) {
    let a = this.asientos.get(j.id);
    if (!a && crear) {
      a = { id: j.id, apuesta: 0, pares: 0, tresYmas: 0, manos: [], activa: 0, seguro: null, seguroGanado: 0, laterales: {}, listo: false, terminado: false, resultado: null };
      this.asientos.set(j.id, a);
    }
    return a;
  }

  repartir() {
    if (this.fase !== 'apuestas') return { ok: false, error: 'La ronda ya empezó.' };
    // Quien no llegó al mínimo o solo puso laterales recupera su dinero
    for (const [id, a] of this.asientos) {
      if (a.apuesta < this.R.min) {
        const j = this.solo || this.jugador(id);
        if (j) {
          this.casino.abonar(j, a.apuesta + a.pares + a.tresYmas);
          this.casino.avisar(j, `La apuesta mínima es ${dinero(this.R.min)}: te devolvimos tus fichas.`);
        }
        this.asientos.delete(id);
      }
    }
    if (!this.asientos.size) {
      if (this.solo) return { ok: false, error: `Apuesta al menos ${dinero(this.R.min)}.` };
      this.abrirApuestas();
      return { ok: false, error: 'Nadie apostó el mínimo.' };
    }
    this.quitar('cierre');
    this.cierreEn = null;
    this.barajado = false;
    if (this.zapato.length < this.corte) {
      this.barajar();
      this.evento('barajar', {});
    }
    this.fase = 'reparto';
    const lista = [...this.asientos.values()];
    for (const a of lista) a.manos = [{ cartas: [], apuesta: a.apuesta, estado: 'jugando', dividida: false, doblada: false, asDividido: false, resultado: null, ganado: 0 }];
    for (const a of lista) a.manos[0].cartas.push(this.sacar());
    this.crupier.cartas.push(this.sacar());
    for (const a of lista) a.manos[0].cartas.push(this.sacar());
    this.crupier.cartas.push(this.sacar());
    const visible = this.crupier.cartas[0];
    for (const a of lista) {
      const j = this.solo || this.jugador(a.id);
      const [c1, c2] = a.manos[0].cartas;
      if (a.pares) {
        const r = paresPerfectos(c1, c2);
        const ganado = r ? a.pares * (r.pago + 1) : 0;
        a.laterales.pares = { ...(r || { nombre: 'Sin par' }), ganado, apuesta: a.pares };
        if (ganado && j) this.casino.abonar(j, ganado);
      }
      if (a.tresYmas) {
        const r = veintiunoMasTres(c1, c2, visible);
        const ganado = r ? a.tresYmas * (r.pago + 1) : 0;
        a.laterales.tresYmas = { ...(r || { nombre: 'Sin jugada' }), ganado, apuesta: a.tresYmas };
        if (ganado && j) this.casino.abonar(j, ganado);
      }
      if (esBlackjack(a.manos[0].cartas)) a.manos[0].estado = 'blackjack';
    }
    this.evento('reparto', { ronda: this.ronda });
    this.actualizar();
    this.t('reparto', ms(T.reparto), () => {
      if (rangoDe(visible) === 'A' && this.R.seguro) this.ofrecerSeguro();
      else this.revisar();
    });
    return { ok: true };
  }

  ofrecerSeguro() {
    this.fase = 'seguro';
    for (const a of this.asientos.values()) a.seguro = null;
    if (!this.solo) {
      this.finSeguroEn = Date.now() + T.seguroVivo;
      this.t('seguro', ms(T.seguroVivo), () => {
        for (const a of this.asientos.values()) if (a.seguro === null) a.seguro = 0;
        this.revisar();
      });
    }
    this.actualizar();
  }

  revisar() {
    this.quitar('seguro');
    this.finSeguroEn = null;
    const visible = this.crupier.cartas[0];
    const revisa = valorDe(visible) === 10 || rangoDe(visible) === 'A';
    if (revisa && esBlackjack(this.crupier.cartas)) {
      this.crupier.oculta = false;
      for (const a of this.asientos.values()) {
        if (a.seguro > 0) {
          a.seguroGanado = a.seguro * 3;
          const j = this.solo || this.jugador(a.id);
          if (j) this.casino.abonar(j, a.seguroGanado);
        }
      }
      this.evento('crupierBJ', {});
      return this.liquidar();
    }
    this.iniciarTurnos();
  }

  iniciarTurnos() {
    this.fase = 'turnos';
    for (const a of this.asientos.values()) this.siguienteMano(a);
    if (this.todosTerminaron()) return this.turnoCrupier();
    if (!this.solo) {
      const espera = this.ajustes.turno * 1000;
      this.finTurnoEn = Date.now() + espera;
      this.t('turno', ms(espera), () => {
        for (const a of this.asientos.values()) {
          for (const m of a.manos) if (m.estado === 'jugando') m.estado = 'plantada';
          a.terminado = true;
        }
        this.turnoCrupier();
      });
    }
    this.actualizar();
  }

  siguienteMano(a) {
    const i = a.manos.findIndex((m) => m.estado === 'jugando');
    if (i < 0) {
      a.terminado = true;
      return;
    }
    a.activa = i;
    // Con 21 se planta solo
    if (total(a.manos[i].cartas).total >= 21) {
      a.manos[i].estado = total(a.manos[i].cartas).total > 21 ? 'pasada' : 'plantada';
      this.siguienteMano(a);
    }
  }

  todosTerminaron() {
    return [...this.asientos.values()].every((a) => a.terminado);
  }

  turnoCrupier() {
    if (this.fase === 'crupier' || this.fase === 'pagos') return;
    this.quitar('turno');
    this.finTurnoEn = null;
    this.fase = 'crupier';
    this.crupier.oculta = false;
    this.actualizar();
    const vivas = [...this.asientos.values()].some((a) => a.manos.some((m) => m.estado === 'plantada'));
    const paso = () => {
      if (vivas && crupierPide(this.crupier.cartas, this.R.h17)) {
        this.crupier.cartas.push(this.sacar());
        this.actualizar();
        this.t('crupier', ms(T.carta), paso);
      } else this.t('crupier', ms(T.carta * 0.6), () => this.liquidar());
    };
    this.t('crupier', ms(T.carta), paso);
  }

  liquidar() {
    this.quitar('turno');
    this.fase = 'pagos';
    this.crupier.oculta = false;
    const tc = total(this.crupier.cartas).total;
    const crupierBJ = esBlackjack(this.crupier.cartas);
    const ganadores = [];
    for (const a of this.asientos.values()) {
      const j = this.solo || this.jugador(a.id);
      let apostado = a.pares + a.tresYmas + (a.seguro > 0 ? a.seguro : 0);
      let ganado = (a.laterales.pares?.ganado || 0) + (a.laterales.tresYmas?.ganado || 0) + a.seguroGanado;
      for (const m of a.manos) {
        apostado += m.apuesta;
        const t = total(m.cartas).total;
        if (m.estado === 'rendida') {
          m.resultado = 'rendida';
          m.ganado = Math.floor(m.apuesta / 2); // ya se devolvió al rendirse
        } else if (m.estado === 'pasada') {
          m.resultado = 'pierde';
          m.ganado = 0;
        } else if (m.estado === 'blackjack') {
          if (crupierBJ) {
            m.resultado = 'empate';
            m.ganado = m.apuesta;
          } else {
            m.resultado = 'blackjack';
            m.ganado = m.apuesta + Math.floor(m.apuesta * this.R.pagoBJ);
          }
        } else if (crupierBJ) {
          m.resultado = 'pierde';
          m.ganado = 0;
        } else if (tc > 21 || t > tc) {
          m.resultado = 'gana';
          m.ganado = m.apuesta * 2;
        } else if (t === tc) {
          m.resultado = 'empate';
          m.ganado = m.apuesta;
        } else {
          m.resultado = 'pierde';
          m.ganado = 0;
        }
        ganado += m.ganado;
        if (m.estado !== 'rendida' && m.ganado && j) this.casino.abonar(j, m.ganado);
      }
      a.resultado = { apostado, ganado, neto: ganado - apostado };
      if (j) {
        const r = a.manos.map((m) => ({ gana: 'ganaste', blackjack: 'blackjack', empate: 'empate', pierde: 'perdiste', rendida: 'te rendiste' })[m.resultado]).join(', ');
        this.casino.anotar(j, ganado - apostado, `${this.R.nombre}: ${r}`);
        if (ganado - apostado > 0) ganadores.push({ id: a.id, nombre: j.nombre, avatar: j.avatar, neto: ganado - apostado });
        if (ganado - apostado >= 10000) this.casino.anunciar(j, ganado - apostado, this.R.nombre);
      }
      this.ultimas.set(a.id, { principal: a.apuesta, pares: a.pares, tresYmas: a.tresYmas });
    }
    this.ganadores = ganadores.sort((x, y) => y.neto - x.neto);
    this.historial.unshift({ ronda: this.ronda, crupier: tc > 21 ? 'se pasó' : crupierBJ ? 'blackjack' : String(tc) });
    this.historial = this.historial.slice(0, 20);
    this.evento('pagos', { ronda: this.ronda });
    if (this.solo) {
      this.siguienteEn = null;
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

  // ---------- Acciones del jugador ----------
  disponibles(a, j) {
    if (this.fase !== 'turnos' || !a || a.terminado) return {};
    const m = a.manos[a.activa];
    if (!m || m.estado !== 'jugando') return {};
    const dos = m.cartas.length === 2;
    const saldo = j.saldo >= m.apuesta;
    return {
      pedir: true,
      plantarse: true,
      doblar: dos && saldo,
      dividir: dos && valorDe(m.cartas[0]) === valorDe(m.cartas[1]) && a.manos.length < this.R.maxManos && saldo,
      rendirse: this.R.rendicion && dos && a.manos.length === 1 && !m.dividida,
    };
  }

  accion(j, tipo, d = {}) {
    if (this.solo && this.solo !== j) return { ok: false, error: 'Esta mesa es de otra persona.' };
    if (this.solo && this.fase === 'pagos' && ['apostar', 'repetir', 'repartir'].includes(tipo)) {
      this.ronda++;
      // "Repartir" desde el resultado repite la apuesta anterior y reparte de una vez
      const repetir = tipo === 'repartir';
      this.abrirApuestas();
      if (repetir) {
        const r = this.accion(j, 'repetir');
        if (!r.ok) return r;
        return this.repartir();
      }
    }
    if (tipo === 'apostar' || tipo === 'repetir' || tipo === 'limpiar' || tipo === 'listo' || tipo === 'repartir') return this.accionApuesta(j, tipo, d);
    if (tipo === 'seguro') {
      if (this.fase !== 'seguro') return { ok: false, error: 'Ya no se ofrece seguro.' };
      const a = this.asientos.get(j.id);
      if (!a || a.seguro !== null) return { ok: false };
      if (d.tomar) {
        const monto = Math.floor(a.apuesta / 2);
        if (!this.casino.cobrar(j, monto)) return { ok: false, error: 'No te alcanza el saldo para el seguro.' };
        a.seguro = monto;
      } else a.seguro = 0;
      if ([...this.asientos.values()].every((x) => x.seguro !== null)) this.revisar();
      else this.actualizar();
      return { ok: true };
    }
    const a = this.asientos.get(j.id);
    const puede = this.disponibles(a, j);
    if (!puede[tipo]) return { ok: false, error: this.fase === 'turnos' ? 'No puedes hacer eso con esta mano.' : 'Espera tu turno.' };
    const m = a.manos[a.activa];
    switch (tipo) {
      case 'pedir': {
        m.cartas.push(this.sacar());
        const t = total(m.cartas).total;
        if (t > 21) m.estado = 'pasada';
        else if (t === 21) m.estado = 'plantada';
        break;
      }
      case 'plantarse':
        m.estado = 'plantada';
        break;
      case 'doblar': {
        if (!this.casino.cobrar(j, m.apuesta)) return { ok: false, error: 'No te alcanza el saldo.' };
        m.apuesta *= 2;
        m.doblada = true;
        m.cartas.push(this.sacar());
        m.estado = total(m.cartas).total > 21 ? 'pasada' : 'plantada';
        break;
      }
      case 'dividir': {
        if (!this.casino.cobrar(j, m.apuesta)) return { ok: false, error: 'No te alcanza el saldo.' };
        const [c1, c2] = m.cartas;
        const ases = rangoDe(c1) === 'A';
        m.cartas = [c1, this.sacar()];
        m.dividida = true;
        const nueva = { cartas: [c2, this.sacar()], apuesta: m.apuesta, estado: 'jugando', dividida: true, doblada: false, asDividido: ases, resultado: null, ganado: 0 };
        m.asDividido = ases;
        a.manos.splice(a.activa + 1, 0, nueva);
        if (ases) {
          // Ases divididos reciben una sola carta cada uno
          m.estado = 'plantada';
          nueva.estado = 'plantada';
        }
        break;
      }
      case 'rendirse': {
        m.estado = 'rendida';
        this.casino.abonar(j, Math.floor(m.apuesta / 2));
        break;
      }
    }
    this.siguienteMano(a);
    if (this.todosTerminaron()) this.turnoCrupier();
    else this.actualizar();
    return { ok: true };
  }

  accionApuesta(j, tipo, d) {
    if (this.fase !== 'apuestas') return { ok: false, error: 'Las apuestas están cerradas.' };
    if (tipo === 'apostar') {
      const zona = ZONAS.includes(d.zona) ? d.zona : null;
      const ficha = Number(d.ficha);
      if (!zona || !FICHAS.includes(ficha)) return { ok: false, error: 'Apuesta inválida.' };
      if (zona !== 'principal' && !this.R.laterales) return { ok: false, error: 'Esta mesa no tiene apuestas laterales.' };
      const a = this.asiento(j);
      const campo = zona === 'principal' ? 'apuesta' : zona;
      const tope = zona === 'principal' ? this.R.max : MAX_LATERAL;
      if (a[campo] + ficha > tope) return { ok: false, error: `Máximo ${dinero(tope)} en esa apuesta.` };
      if (!this.casino.cobrar(j, ficha)) return { ok: false, error: 'No te alcanza el saldo.' };
      a[campo] += ficha;
      a.listo = false;
      this.actualizar();
      return { ok: true };
    }
    if (tipo === 'limpiar') {
      const a = this.asientos.get(j.id);
      if (a) {
        this.casino.abonar(j, a.apuesta + a.pares + a.tresYmas);
        this.asientos.delete(j.id);
      }
      this.actualizar();
      return { ok: true };
    }
    if (tipo === 'repetir') {
      const u = this.ultimas.get(j.id);
      if (!u) return { ok: false, error: 'No hay apuesta anterior.' };
      const costo = u.principal + (this.R.laterales ? u.pares + u.tresYmas : 0);
      const a = this.asiento(j);
      if (a.apuesta + u.principal > this.R.max) return { ok: false, error: 'Pasarías el máximo de la mesa.' };
      if (!this.casino.cobrar(j, costo)) return { ok: false, error: 'No te alcanza el saldo.' };
      a.apuesta += u.principal;
      if (this.R.laterales) {
        a.pares += u.pares;
        a.tresYmas += u.tresYmas;
      }
      this.actualizar();
      return { ok: true };
    }
    if (tipo === 'listo' || tipo === 'repartir') {
      const a = this.asientos.get(j.id);
      if (!a || a.apuesta < this.R.min) return { ok: false, error: `Apuesta al menos ${dinero(this.R.min)}.` };
      if (this.solo) return this.repartir();
      a.listo = true;
      const sentados = [...this.asientos.values()].filter((x) => x.apuesta > 0);
      if (sentados.every((x) => x.listo)) this.repartir();
      else this.actualizar();
      return { ok: true };
    }
    return { ok: false };
  }

  host(tipo, d = {}) {
    if (tipo === 'repartir') {
      if (this.fase !== 'apuestas') return { ok: false, error: 'La ronda ya empezó.' };
      return this.repartir();
    }
    if (tipo === 'ajustes') {
      this.ajustes = Blackjack.normalizar(d, this.ajustes);
      if (this.fase === 'apuestas') {
        // Reinicia el reloj sin perder las fichas puestas
        const asientos = this.asientos;
        this.abrirApuestas();
        this.asientos = asientos;
        this.actualizar();
      }
      return { ok: true };
    }
    if (tipo === 'prueba') {
      if (Array.isArray(d.cartas)) this.forzadas = d.cartas.map(String);
      return { ok: true };
    }
    return { ok: false, error: 'Acción desconocida.' };
  }

  cancelar() {
    for (const a of this.asientos.values()) {
      const j = this.solo || this.jugador(a.id);
      if (!j) continue;
      if (this.fase === 'apuestas') this.casino.abonar(j, a.apuesta + a.pares + a.tresYmas);
      else if (this.fase !== 'pagos') {
        // Laterales y seguro ya se resolvieron; se devuelven las manos en juego
        const enJuego = a.manos.reduce((s, m) => s + (m.estado === 'rendida' ? Math.ceil(m.apuesta / 2) : m.apuesta), 0);
        if (enJuego) this.casino.abonar(j, enJuego);
        const neto = (a.laterales.pares?.ganado || 0) + (a.laterales.tresYmas?.ganado || 0) + a.seguroGanado - a.pares - a.tresYmas - (a.seguro > 0 ? a.seguro : 0);
        if (a.pares || a.tresYmas || a.seguro > 0) this.casino.anotar(j, neto, `${this.R.nombre}: ronda cancelada, se devolvieron las manos`);
      }
    }
    this.asientos = new Map();
  }

  // ---------- Estado ----------
  vistaAsiento(a) {
    const j = this.solo || this.jugador(a.id);
    return {
      id: a.id,
      nombre: j?.nombre || '?',
      avatar: j?.avatar || '',
      conectado: j?.conectado ?? false,
      apuesta: a.apuesta,
      pares: a.pares,
      tresYmas: a.tresYmas,
      seguro: a.seguro,
      seguroGanado: a.seguroGanado,
      laterales: a.laterales,
      listo: a.listo,
      terminado: a.terminado,
      activa: a.activa,
      resultado: a.resultado,
      manos: a.manos.map((m) => ({ cartas: m.cartas, apuesta: m.apuesta, estado: m.estado, resultado: m.resultado, ganado: m.ganado, doblada: m.doblada, dividida: m.dividida, total: textoTotal(m.cartas, m.dividida) })),
    };
  }

  publico() {
    const visibles = this.crupier.oculta ? this.crupier.cartas.slice(0, 1) : this.crupier.cartas;
    return {
      variante: this.variante,
      fase: this.fase,
      ronda: this.ronda,
      ajustes: this.ajustes,
      cierreEn: this.cierreEn,
      finSeguroEn: this.finSeguroEn,
      finTurnoEn: this.finTurnoEn,
      siguienteEn: this.siguienteEn,
      crupier: { cartas: visibles, oculta: this.crupier.oculta && this.crupier.cartas.length > 1, total: visibles.length ? textoTotal(visibles) : '' },
      asientos: [...this.asientos.values()].map((a) => this.vistaAsiento(a)),
      zapato: { quedan: this.zapato.length, total: this.R.mazos * 52, barajado: this.barajado },
      ganadores: this.ganadores || [],
      historial: this.historial,
    };
  }

  privado(j) {
    const a = this.asientos.get(j.id);
    return {
      asiento: a ? this.vistaAsiento(a) : null,
      acciones: this.disponibles(a, j),
      ultimas: this.ultimas.get(j.id) || null,
    };
  }
}
