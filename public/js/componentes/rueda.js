// Rueda de ruleta en canvas: dibuja el cilindro con el orden real y anima el giro
// hasta caer exactamente en el número que decidió el servidor.
import { VARIANTES, colorDe, etiqueta } from '../shared/ruleta.js';
import { sonido } from '../casino-comun.js';

const COLORES = { rojo: '#c8102e', negro: '#1a1423', verde: '#0c8a55' };
const TINTA = '#1a1423';
const PAPEL = '#fbf3de';
const ORO = '#ffb21f';
const F_DISPLAY = '"Alfa Slab One", "Rockwell", Georgia, serif';

export class Rueda {
  constructor(canvas, variante, { sonar = true } = {}) {
    this.canvas = canvas;
    this.orden = VARIANTES[variante].orden;
    this.n = this.orden.length;
    this.paso = (2 * Math.PI) / this.n;
    this.angRueda = 0;
    this.angBola = -Math.PI / 2;
    this.radioBola = 1; // 1 = pista exterior, 0 = dentro de la casilla
    this.giro = null;
    this.reposo = 0.12; // rad/s de rotación en reposo
    this.casillaBola = null; // índice donde descansa la bola
    this.resaltado = null;
    this.sonar = sonar;
    this.vivo = true;
    this.fondo = null;
    this.ultimoT = performance.now();
    this.ultimaCasillaSonada = -1;
    this.obs = new ResizeObserver(() => this.medir());
    this.obs.observe(canvas);
    this.medir();
    document.fonts?.ready.then(() => {
      this.fondo = null;
    });
    this.cuadro = requestAnimationFrame((t) => this.bucle(t));
  }

  destruir() {
    this.vivo = false;
    cancelAnimationFrame(this.cuadro);
    this.obs.disconnect();
  }

  medir() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const lado = Math.max(80, Math.round(Math.min(r.width, r.height || r.width) * dpr));
    if (this.canvas.width !== lado) {
      this.canvas.width = lado;
      this.canvas.height = lado;
      this.fondo = null;
    }
  }

  // Dibuja la parte que gira (casillas y números) en un canvas aparte, una sola vez.
  dibujarFondo() {
    const L = this.canvas.width;
    const c = document.createElement('canvas');
    c.width = c.height = L;
    const g = c.getContext('2d');
    const R = L / 2;
    g.translate(R, R);
    const rExt = R * 0.84;
    const rNum = R * 0.73;
    const rInt = R * 0.6;
    const rCono = R * 0.47;
    for (let i = 0; i < this.n; i++) {
      const n = this.orden[i];
      const a0 = -Math.PI / 2 + i * this.paso - this.paso / 2;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, rExt, a0, a0 + this.paso);
      g.closePath();
      g.fillStyle = COLORES[colorDe(n)];
      g.fill();
      // número
      g.save();
      g.rotate(a0 + this.paso / 2 + Math.PI / 2);
      g.fillStyle = PAPEL;
      g.font = `${Math.round(R * 0.075)}px ${F_DISPLAY}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(etiqueta(n), 0, -rNum);
      g.restore();
    }
    // separadores dorados
    g.strokeStyle = 'rgba(255,215,140,0.85)';
    g.lineWidth = Math.max(1, R * 0.006);
    for (let i = 0; i < this.n; i++) {
      const a = -Math.PI / 2 + i * this.paso - this.paso / 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * rCono, Math.sin(a) * rCono);
      g.lineTo(Math.cos(a) * rExt, Math.sin(a) * rExt);
      g.stroke();
    }
    // anillo de casillas (donde cae la bola)
    g.beginPath();
    g.arc(0, 0, rInt, 0, Math.PI * 2);
    g.lineWidth = R * 0.012;
    g.strokeStyle = 'rgba(255,215,140,0.85)';
    g.stroke();
    // cono central de madera
    const cono = g.createRadialGradient(-R * 0.08, -R * 0.1, R * 0.02, 0, 0, rCono);
    cono.addColorStop(0, '#c98a4b');
    cono.addColorStop(0.65, '#7a4a22');
    cono.addColorStop(1, '#4a2a12');
    g.beginPath();
    g.arc(0, 0, rCono, 0, Math.PI * 2);
    g.fillStyle = cono;
    g.fill();
    g.lineWidth = R * 0.018;
    g.strokeStyle = TINTA;
    g.stroke();
    // torreta en cruz
    g.save();
    g.fillStyle = ORO;
    g.strokeStyle = TINTA;
    g.lineWidth = R * 0.01;
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.roundRect(-R * 0.025, -R * 0.3, R * 0.05, R * 0.24, R * 0.02);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(0, -R * 0.31, R * 0.035, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.beginPath();
    g.arc(0, 0, R * 0.07, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
    this.fondo = c;
  }

  indiceDe(numero) {
    return this.orden.indexOf(numero);
  }

  // Ángulo absoluto del centro de la casilla i con la rueda en angRueda
  anguloCasilla(i, angRueda = this.angRueda) {
    return -Math.PI / 2 + i * this.paso + angRueda;
  }

  girar(numero, duracion = 8000) {
    const i = this.indiceDe(numero);
    if (i < 0) return Promise.resolve();
    this.resaltado = null;
    const ahora = performance.now();
    const vueltasRueda = 2 + duracion / 4000;
    const vueltasBola = 5 + duracion / 1600;
    // La bola termina arriba a la derecha; la rueda gira para dejar ahí la casilla ganadora
    const finBola = -Math.PI / 2 + Math.PI / 5;
    const r0 = this.angRueda;
    let r1 = r0 + vueltasRueda * 2 * Math.PI;
    const deseado = finBola + Math.PI / 2 - i * this.paso; // angRueda que pone la casilla en finBola
    const ajuste = ((((deseado - r1) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    r1 += ajuste;
    const b0 = this.angBola;
    let b1 = b0 - vueltasBola * 2 * Math.PI;
    const ajusteB = ((((b1 - finBola) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    b1 -= ajusteB;
    this.casillaBola = null;
    return new Promise((res) => {
      this.giro = { t0: ahora, dur: duracion, r0, r1, b0, b1, i, res };
    });
  }

  // Coloca la bola en un número sin animación (por ejemplo al reconectarse)
  mostrar(numero) {
    const i = this.indiceDe(numero);
    if (i < 0) return;
    this.giro = null;
    this.casillaBola = i;
    this.radioBola = 0;
    this.resaltado = i;
  }

  bucle(t) {
    if (!this.vivo) return;
    const dt = Math.min(0.1, (t - this.ultimoT) / 1000);
    this.ultimoT = t;
    if (this.giro) {
      const g = this.giro;
      const k = Math.min(1, (t - g.t0) / g.dur);
      const eR = 1 - Math.pow(1 - k, 3);
      const eB = 1 - Math.pow(1 - k, 2.4);
      this.angRueda = g.r0 + (g.r1 - g.r0) * eR;
      this.angBola = g.b0 + (g.b1 - g.b0) * eB;
      // La bola baja de la pista a las casillas en el último tramo, con un pequeño rebote
      const baja = Math.max(0, (k - 0.62) / 0.38);
      this.radioBola = Math.max(0, 1 - baja * 1.08 + (baja > 0.7 ? Math.sin((baja - 0.7) * 26) * 0.06 * (1 - baja) : 0));
      if (this.sonar && baja > 0) {
        const casilla = Math.floor(((this.angBola - this.angRueda) / this.paso) % this.n);
        if (casilla !== this.ultimaCasillaSonada) {
          this.ultimaCasillaSonada = casilla;
          if (k < 0.97) sonido.tic();
        }
      }
      if (k >= 1) {
        this.casillaBola = g.i;
        this.resaltado = g.i;
        this.radioBola = 0;
        this.giro = null;
        g.res();
      }
    } else {
      this.angRueda += this.reposo * dt;
      if (this.casillaBola === null) this.angBola -= this.reposo * 1.5 * dt;
    }
    this.dibujar();
    this.cuadro = requestAnimationFrame((x) => this.bucle(x));
  }

  dibujar() {
    const L = this.canvas.width;
    if (!L) return;
    if (!this.fondo || this.fondo.width !== L) this.dibujarFondo();
    const g = this.canvas.getContext('2d');
    const R = L / 2;
    g.clearRect(0, 0, L, L);
    // Aro exterior de madera y tinta
    g.save();
    g.translate(R, R);
    g.beginPath();
    g.arc(0, 0, R * 0.995, 0, Math.PI * 2);
    g.fillStyle = TINTA;
    g.fill();
    const madera = g.createRadialGradient(0, 0, R * 0.86, 0, 0, R * 0.98);
    madera.addColorStop(0, '#5a3418');
    madera.addColorStop(0.5, '#8b5a2b');
    madera.addColorStop(1, '#4a2a12');
    g.beginPath();
    g.arc(0, 0, R * 0.97, 0, Math.PI * 2);
    g.fillStyle = madera;
    g.fill();
    // pista de la bola
    g.beginPath();
    g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
    g.fillStyle = '#2b1a10';
    g.fill();
    g.beginPath();
    g.arc(0, 0, R * 0.865, 0, Math.PI * 2);
    g.lineWidth = R * 0.012;
    g.strokeStyle = ORO;
    g.stroke();
    // parte que gira
    g.rotate(this.angRueda);
    g.drawImage(this.fondo, -R, -R, L, L);
    g.restore();
    // casilla ganadora resaltada
    if (this.resaltado !== null && !this.giro) {
      const a = this.anguloCasilla(this.resaltado);
      g.save();
      g.translate(R, R);
      g.beginPath();
      g.arc(0, 0, R * 0.845, a - this.paso / 2, a + this.paso / 2);
      g.arc(0, 0, R * 0.6, a + this.paso / 2, a - this.paso / 2, true);
      g.closePath();
      g.lineWidth = R * 0.02;
      g.strokeStyle = ORO;
      g.stroke();
      g.restore();
    }
    // bola
    let ang = this.angBola;
    if (this.casillaBola !== null && !this.giro) ang = this.anguloCasilla(this.casillaBola);
    const rPista = R * 0.88;
    const rCasilla = R * 0.645;
    const rb = rCasilla + (rPista - rCasilla) * this.radioBola;
    const bx = R + Math.cos(ang) * rb;
    const by = R + Math.sin(ang) * rb;
    const tam = R * 0.04;
    const brillo = g.createRadialGradient(bx - tam * 0.35, by - tam * 0.35, tam * 0.1, bx, by, tam);
    brillo.addColorStop(0, '#ffffff');
    brillo.addColorStop(1, '#c9c3b5');
    g.beginPath();
    g.arc(bx, by, tam, 0, Math.PI * 2);
    g.fillStyle = brillo;
    g.fill();
    g.lineWidth = Math.max(1, R * 0.006);
    g.strokeStyle = TINTA;
    g.stroke();
  }
}
