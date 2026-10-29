// Impresión: dibuja cartas, reversos y tablas en canvas y arma un PDF listo para imprimir.
// Todo ocurre en el navegador; no hace falta internet ni librerías externas.
import { SVG_ARTE, colorDe } from './shared/baraja.js';

export const PAPELES = {
  carta: { nombre: 'Carta (21.6 × 27.9 cm)', w: 215.9, h: 279.4 },
  a4: { nombre: 'A4 (21 × 29.7 cm)', w: 210, h: 297 },
};
export const TAMANOS_CARTA = {
  chica: { nombre: 'Chica', w: 56 },
  mediana: { nombre: 'Mediana', w: 63 },
  grande: { nombre: 'Grande', w: 86 },
};
const ASPECTO_CARTA = 7.6 / 5;
const ASPECTO_CELDA = 6.9 / 5;
const PAPEL = '#fbf3de';
const TINTA = '#1a1423';
const F_DISPLAY = '"Alfa Slab One", "Rockwell", Georgia, serif';
const F_UI = '"Rubik Variable", "Rubik", system-ui, sans-serif';
const F_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const DPI = 200;

const lim = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Recursos (fuentes e imágenes) ----------
const cache = new Map();
function cargarImg(src) {
  if (!src) return Promise.resolve(null);
  if (!cache.has(src)) {
    cache.set(
      src,
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = src;
      }),
    );
  }
  return cache.get(src);
}
function svgUrl(clave) {
  const svg = SVG_ARTE[clave];
  if (!svg) return null;
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const conTam = svg.replace('<svg ', `<svg width="${(vb?.[1] || 100) * 6}" height="${(vb?.[2] || 100) * 6}" `);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(conTam);
}

// baraja: { cartas:[{id,nombre,arte,color,img:src|false}], reverso:{...,img:src|false}, encabezado:{...,img:src|false}, estiloImagen }
export async function prepararRecursos(baraja) {
  try {
    await Promise.all([document.fonts.load(`400 40px ${F_DISPLAY}`), document.fonts.load(`600 20px ${F_UI}`), document.fonts.ready]);
  } catch {
    /* se usan fuentes del sistema */
  }
  const imgs = new Map();
  await Promise.all(
    baraja.cartas.map(async (c) => {
      if (c.img) imgs.set(c.id, await cargarImg(c.img));
      else if (c.arte?.startsWith('svg:')) imgs.set(c.arte, await cargarImg(svgUrl(c.arte.slice(4))));
    }),
  );
  return {
    imgs,
    reverso: baraja.reverso?.img ? await cargarImg(baraja.reverso.img) : null,
    encabezado: baraja.encabezado?.img ? await cargarImg(baraja.encabezado.img) : null,
  };
}

// ---------- Primitivas ----------
function redondo(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function cubrir(ctx, img, x, y, w, h) {
  const esc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / esc;
  const sh = h / esc;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}
function mezcla(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * pct + 255 * (1 - pct)));
  return `rgb(${c.join(',')})`;
}
function ajustarTexto(ctx, texto, maxW, tam, minTam, familia, peso = 400) {
  let f = tam;
  ctx.font = `${peso} ${f}px ${familia}`;
  while (ctx.measureText(texto).width > maxW && f > minTam) {
    f *= 0.94;
    ctx.font = `${peso} ${f}px ${familia}`;
  }
  let t = texto;
  while (ctx.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2) + '…';
  return { t, f };
}

// ---------- Carta (frente) ----------
export function dibujarCarta(ctx, carta, numero, indice, x, y, w, h, R, estilo = 'arte') {
  const color = colorDe(carta, indice);
  const img = carta.img ? R.imgs.get(carta.id) : null;
  ctx.save();
  ctx.fillStyle = PAPEL;
  ctx.fillRect(x, y, w, h);
  if (estilo === 'completa' && img) {
    cubrir(ctx, img, x, y, w, h);
    ctx.restore();
    return;
  }
  const p = 0.045 * w;
  const bt = 0.018 * w;
  const rr = 0.024 * w;
  const mx = x + p;
  const my = y + p;
  const mw = w - 2 * p;
  const mh = h - 2 * p;
  redondo(ctx, mx, my, mw, mh, rr);
  ctx.fillStyle = TINTA;
  ctx.fill();
  const ix = mx + bt;
  const iy = my + bt;
  const iw = mw - 2 * bt;
  const ih = mh - 2 * bt;
  const nombre = carta.nombre.toLocaleUpperCase('es-MX');
  const f = lim(w / Math.max(6, nombre.length), 0.052 * w, 0.105 * w);
  const linea = 0.016 * w;
  const banda = 0.026 * w + 1.05 * f + 0.022 * w;
  const artH = ih - banda - linea;

  ctx.save();
  redondo(ctx, ix, iy, iw, ih, Math.max(0, rr - bt));
  ctx.clip();
  // Fondo del arte
  const cx = ix + iw / 2;
  const cy = iy + artH * 0.42;
  const rad = Math.hypot(Math.max(cx - ix, ix + iw - cx), Math.max(cy - iy, iy + artH - cy));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  g.addColorStop(0, mezcla(color, 0.45));
  g.addColorStop(0.7, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fillRect(ix, iy, iw, artH);
  // Figura
  ctx.shadowColor = 'rgba(26,20,35,0.35)';
  ctx.shadowOffsetX = 0.014 * w;
  ctx.shadowOffsetY = 0.02 * w;
  if (img) {
    ctx.shadowColor = 'transparent';
    cubrir(ctx, img, ix, iy, iw, artH);
  } else if (carta.arte?.startsWith('svg:') && R.imgs.get(carta.arte)) {
    const s = R.imgs.get(carta.arte);
    const sw = iw * 0.74;
    const sh = (sw * s.naturalHeight) / s.naturalWidth;
    ctx.drawImage(s, cx - sw / 2, iy + artH / 2 - sh / 2, sw, sh);
  } else {
    ctx.font = `${0.5 * w}px ${F_EMOJI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TINTA;
    ctx.fillText(carta.arte || '🎴', cx, iy + artH / 2 + 0.03 * w);
  }
  ctx.shadowColor = 'transparent';
  // Número
  if (numero) {
    const d = 0.15 * w;
    const borde = 0.012 * w;
    ctx.font = `400 ${0.085 * w}px ${F_DISPLAY}`;
    const tw = ctx.measureText(String(numero)).width;
    const pw = Math.max(d, tw + 0.04 * w + 2 * borde);
    const nx = ix + 0.03 * w;
    const ny = iy + 0.03 * w;
    redondo(ctx, nx, ny, pw, d, d / 2);
    ctx.fillStyle = TINTA;
    ctx.fill();
    redondo(ctx, nx + borde, ny + borde, pw - 2 * borde, d - 2 * borde, d / 2 - borde);
    ctx.fillStyle = PAPEL;
    ctx.fill();
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(numero), nx + pw / 2, ny + d / 2 + 0.006 * w);
  }
  // Banda del nombre
  ctx.fillStyle = TINTA;
  ctx.fillRect(ix, iy + artH, iw, linea);
  ctx.fillStyle = PAPEL;
  ctx.fillRect(ix, iy + artH + linea, iw, banda);
  const { t, f: f2 } = ajustarTexto(ctx, nombre, iw * 0.92, f, 0.04 * w, F_DISPLAY);
  ctx.font = `400 ${f2}px ${F_DISPLAY}`;
  ctx.fillStyle = TINTA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, cx, iy + artH + linea + banda / 2 + 0.004 * w);
  ctx.restore();
  ctx.restore();
}

// ---------- Reverso ----------
export function dibujarReverso(ctx, rev, x, y, w, h, R) {
  const b = Math.min(w, h * (5 / 7.6));
  ctx.save();
  ctx.fillStyle = PAPEL;
  ctx.fillRect(x, y, w, h);
  const p = 0.045 * b;
  const bt = 0.018 * b;
  const rr = 0.024 * b;
  redondo(ctx, x + p, y + p, w - 2 * p, h - 2 * p, rr);
  ctx.fillStyle = TINTA;
  ctx.fill();
  const ix = x + p + bt;
  const iy = y + p + bt;
  const iw = w - 2 * (p + bt);
  const ih = h - 2 * (p + bt);
  ctx.save();
  redondo(ctx, ix, iy, iw, ih, Math.max(0, rr - bt));
  ctx.clip();
  if (R.reverso) cubrir(ctx, R.reverso, ix, iy, iw, ih);
  else {
    // Degradado a 160° como en pantalla
    const ang = (160 * Math.PI) / 180;
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    const largo = Math.abs(iw * dx) + Math.abs(ih * dy);
    const cx = ix + iw / 2;
    const cy = iy + ih / 2;
    const g = ctx.createLinearGradient(cx - (dx * largo) / 2, cy - (dy * largo) / 2, cx + (dx * largo) / 2, cy + (dy * largo) / 2);
    g.addColorStop(0, rev.color1 || '#7a1450');
    g.addColorStop(1, rev.color2 || '#1f5bb5');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
    // Celosía diagonal
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 0.014 * b;
    const paso = 0.084 * b;
    const diag = iw + ih;
    ctx.beginPath();
    for (let s = -diag; s < diag; s += paso) {
      ctx.moveTo(ix + s, iy);
      ctx.lineTo(ix + s + ih, iy + ih);
      ctx.moveTo(ix + s + ih, iy);
      ctx.lineTo(ix + s, iy + ih);
    }
    ctx.stroke();
    // Sello central
    const D = 0.74 * Math.min(iw, ih * 0.75);
    const scx = ix + iw / 2;
    const scy = iy + ih / 2;
    ctx.beginPath();
    ctx.arc(scx, scy, D / 2, 0, Math.PI * 2);
    ctx.fillStyle = PAPEL;
    ctx.fill();
    ctx.lineWidth = 0.025 * D;
    ctx.strokeStyle = TINTA;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(scx, scy, D / 2 - 0.05 * D, 0, Math.PI * 2);
    ctx.lineWidth = 0.012 * D;
    ctx.stroke();
    const texto = (rev.texto || 'LOTERÍA').trim();
    const palabras = texto.split(/\s+/);
    let f = lim((0.95 * D) / Math.max(5, texto.length), 0.077 * D, 0.17 * D);
    ctx.font = `400 ${f}px ${F_DISPLAY}`;
    const maxW = D * 0.72;
    const lineas = [];
    let actual = '';
    for (const pal of palabras) {
      const prueba = actual ? actual + ' ' + pal : pal;
      if (ctx.measureText(prueba).width > maxW && actual) {
        lineas.push(actual);
        actual = pal;
      } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    while (lineas.some((l) => ctx.measureText(l).width > maxW) && f > 0.05 * D) {
      f *= 0.93;
      ctx.font = `400 ${f}px ${F_DISPLAY}`;
    }
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const alto = f * 1.05;
    lineas.forEach((l, i) => ctx.fillText(l, scx, scy + (i - (lineas.length - 1) / 2) * alto + 0.04 * f));
  }
  ctx.restore();
  ctx.restore();
}

// ---------- Tabla ----------
export function medidasTabla(w, n, enc = {}) {
  const pad = 0.028 * w;
  const gap = 0.016 * w;
  const cabH = enc.subtitulo ? 0.135 * w : 0.11 * w;
  const iw = w - 2 * pad;
  const cw = (iw - (n - 1) * gap) / n;
  const ch = cw * ASPECTO_CELDA;
  const gridH = n * ch + (n - 1) * gap;
  const pie = 0.055 * w;
  const h = pad + cabH + 0.024 * w + gridH + pie;
  return { pad, gap, cabH, iw, cw, ch, gridH, pie, h };
}

export function dibujarTabla(ctx, baraja, R, tabla, n, x, y, w, etiqueta) {
  const enc = baraja.encabezado || {};
  const m = medidasTabla(w, n, enc);
  ctx.save();
  // Fondo y borde
  redondo(ctx, x, y, w, m.h, 0.02 * w);
  ctx.fillStyle = PAPEL;
  ctx.fill();
  ctx.lineWidth = 0.007 * w;
  ctx.strokeStyle = TINTA;
  ctx.stroke();
  // Encabezado
  const hx = x + m.pad;
  const hy = y + m.pad;
  redondo(ctx, hx, hy, m.iw, m.cabH, 0.016 * w);
  ctx.fillStyle = enc.color || '#e4007c';
  ctx.fill();
  ctx.lineWidth = 0.009 * w;
  ctx.strokeStyle = TINTA;
  ctx.stroke();
  let textoX = hx + m.iw / 2;
  if (R.encabezado) {
    const lh = m.cabH * 0.68;
    const lw = Math.min((lh * R.encabezado.naturalWidth) / R.encabezado.naturalHeight, m.iw * 0.25);
    const ly = hy + (m.cabH - lh) / 2;
    ctx.fillStyle = '#fff';
    redondo(ctx, hx + 0.03 * w, ly, lw, lh, 0.01 * w);
    ctx.fill();
    ctx.save();
    redondo(ctx, hx + 0.03 * w, ly, lw, lh, 0.01 * w);
    ctx.clip();
    const esc = Math.min(lw / R.encabezado.naturalWidth, lh / R.encabezado.naturalHeight);
    const dw = R.encabezado.naturalWidth * esc;
    const dh = R.encabezado.naturalHeight * esc;
    ctx.drawImage(R.encabezado, hx + 0.03 * w + (lw - dw) / 2, ly + (lh - dh) / 2, dw, dh);
    ctx.restore();
    textoX += (lw + 0.03 * w) / 2;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titulo = (enc.texto || 'LOTERÍA').trim();
  const { t, f } = ajustarTexto(ctx, titulo, m.iw * (R.encabezado ? 0.62 : 0.9), 0.072 * w, 0.04 * w, F_DISPLAY);
  const tituloY = hy + (enc.subtitulo ? m.cabH * 0.4 : m.cabH / 2 + 0.004 * w);
  ctx.font = `400 ${f}px ${F_DISPLAY}`;
  ctx.fillStyle = 'rgba(26,20,35,0.45)';
  ctx.fillText(t, textoX + 0.005 * w, tituloY + 0.005 * w);
  ctx.fillStyle = '#fff';
  ctx.fillText(t, textoX, tituloY);
  if (enc.subtitulo) {
    const s = ajustarTexto(ctx, enc.subtitulo, m.iw * 0.85, 0.032 * w, 0.02 * w, F_UI, 600);
    ctx.font = `600 ${s.f}px ${F_UI}`;
    ctx.fillText(s.t, textoX, hy + m.cabH * 0.76);
  }
  // Rejilla de cartas
  const gy = hy + m.cabH + 0.024 * w;
  tabla.celdas.forEach((id, i) => {
    const c = baraja.porId.get(id);
    if (!c) return;
    const cx = x + m.pad + (i % n) * (m.cw + m.gap);
    const cy = gy + Math.floor(i / n) * (m.ch + m.gap);
    dibujarCarta(ctx, c, c.numero, c.indice, cx, cy, m.cw, m.ch, R, baraja.estiloImagen);
    ctx.lineWidth = Math.max(1, 0.002 * w);
    ctx.strokeStyle = 'rgba(26,20,35,0.35)';
    ctx.strokeRect(cx, cy, m.cw, m.ch);
  });
  // Pie: número de tabla
  if (etiqueta) {
    ctx.font = `600 ${0.03 * w}px ${F_UI}`;
    ctx.fillStyle = TINTA;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(etiqueta, x + w - m.pad, gy + m.gridH + m.pie / 2);
    if (baraja.nombre) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(26,20,35,0.6)';
      const nb = ajustarTexto(ctx, baraja.nombre, m.iw * 0.55, 0.026 * w, 0.015 * w, F_UI, 500);
      ctx.font = `500 ${nb.f}px ${F_UI}`;
      ctx.fillText(nb.t, x + m.pad, gy + m.gridH + m.pie / 2);
    }
  }
  ctx.restore();
  return m.h;
}

// ---------- Generar tablas distintas y parejas ----------
// Cada figura aparece un número parecido de veces y no se repite ninguna tabla.
export function generarTablas(ids, n, cantidad) {
  const n2 = n * n;
  const usos = new Map(ids.map((id) => [id, 0]));
  const firmas = new Set();
  const tablas = [];
  const azar = () => Math.random();
  for (let k = 0; k < cantidad; k++) {
    let celdas = null;
    for (let intento = 0; intento < 50; intento++) {
      // Prefiere las figuras menos usadas; si sale repetida, mete más azar
      const peso = new Map(ids.map((id) => [id, usos.get(id) + azar() * (1 + intento)]));
      const elegidas = [...ids].sort((a, b) => peso.get(a) - peso.get(b)).slice(0, n2);
      const firma = [...elegidas].sort().join(',');
      if (!firmas.has(firma) || intento === 49) {
        firmas.add(firma);
        celdas = elegidas.sort(() => azar() - 0.5);
        break;
      }
    }
    celdas.forEach((id) => usos.set(id, usos.get(id) + 1));
    tablas.push({ id: 'imp' + (k + 1), celdas, numero: k + 1 });
  }
  return tablas;
}

// ---------- Paginación ----------
function rejilla(W, H, iw, ih, margen, gap) {
  const cols = Math.max(1, Math.floor((W - 2 * margen + gap) / (iw + gap)));
  const rows = Math.max(1, Math.floor((H - 2 * margen + gap) / (ih + gap)));
  const totW = cols * iw + (cols - 1) * gap;
  const totH = rows * ih + (rows - 1) * gap;
  const x0 = (W - totW) / 2;
  const y0 = (H - totH) / 2;
  const slots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * (iw + gap), y: y0 + r * (ih + gap), w: iw, h: ih, c, r });
  return { cols, rows, slots, iw, ih, x0, y0, totW, totH };
}

// Posición del reverso para que caiga justo detrás del frente al imprimir a doble cara.
function espejo(g, k, horizontal, borde) {
  const { c, r } = g.slots[k];
  // Hoja vertical + lado largo, u hoja horizontal + lado corto: espejo izquierda-derecha.
  const lr = (!horizontal && borde === 'largo') || (horizontal && borde === 'corto');
  const c2 = lr ? g.cols - 1 - c : c;
  const r2 = lr ? r : g.rows - 1 - r;
  return g.slots[r2 * g.cols + c2];
}

export function planBaraja(baraja, op) {
  const P = PAPELES[op.papel] || PAPELES.carta;
  const W = P.w;
  const H = P.h;
  const cw = (TAMANOS_CARTA[op.tam] || TAMANOS_CARTA.chica).w;
  const g = rejilla(W, H, cw, cw * ASPECTO_CARTA, 6, 4);
  const porHoja = g.cols * g.rows;
  const paginas = [];
  const dx = Number(op.ajusteX) || 0;
  const dy = Number(op.ajusteY) || 0;
  const cartas = baraja.cartas;
  for (let i = 0; i < cartas.length; i += porHoja) {
    const grupo = cartas.slice(i, i + porHoja);
    const frente = { W, H, lado: 'frente', guias: op.guias ? g : null, items: grupo.map((c, k) => ({ tipo: 'carta', carta: c, numero: i + k + 1, indice: i + k, ...g.slots[k] })) };
    const reverso = {
      W,
      H,
      lado: 'reverso',
      items: grupo.map((c, k) => {
        const s = espejo(g, k, false, op.borde);
        return { tipo: 'reverso', x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
      }),
    };
    if (op.modo !== 'reversos') paginas.push(frente);
    if (op.modo !== 'frentes') paginas.push(reverso);
  }
  return { paginas, porHoja, hojas: Math.ceil(cartas.length / porHoja), carta: { w: cw, h: cw * ASPECTO_CARTA } };
}

export function planTablas(baraja, tablas, n, op) {
  const P = PAPELES[op.papel] || PAPELES.carta;
  const horizontal = Number(op.porHoja) === 2;
  const W = horizontal ? P.h : P.w;
  const H = horizontal ? P.w : P.h;
  const porHoja = Number(op.porHoja) || 1;
  const conf = { 1: [1, 1, 12, 0], 2: [2, 1, 10, 10], 4: [2, 2, 8, 8] }[porHoja];
  const [cols, rows, margen, gap] = conf;
  const slotW = (W - 2 * margen - (cols - 1) * gap) / cols;
  const slotH = (H - 2 * margen - (rows - 1) * gap) / rows;
  const proporcion = medidasTabla(1, n, baraja.encabezado).h; // alto por cada unidad de ancho
  const tw = Math.min(slotW, slotH / proporcion);
  const th = tw * proporcion;
  const g = rejilla(W, H, tw, th, (W - cols * tw - (cols - 1) * gap) / 2, gap);
  // Ajusta la rejilla al número exacto de columnas y filas
  g.cols = cols;
  g.rows = rows;
  g.slots = [];
  const x0 = (W - (cols * tw + (cols - 1) * gap)) / 2;
  const y0 = (H - (rows * th + (rows - 1) * gap)) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.slots.push({ x: x0 + c * (tw + gap), y: y0 + r * (th + gap), w: tw, h: th, c, r });
  const paginas = [];
  const dx = Number(op.ajusteX) || 0;
  const dy = Number(op.ajusteY) || 0;
  for (let i = 0; i < tablas.length; i += porHoja) {
    const grupo = tablas.slice(i, i + porHoja);
    paginas.push({ W, H, lado: 'frente', guias: op.guias ? g : null, items: grupo.map((t, k) => ({ tipo: 'tabla', tabla: t, n, etiqueta: op.numerar ? t.etiqueta || `Tabla ${t.numero}` : '', ...g.slots[k] })) });
    if (op.reverso) {
      paginas.push({
        W,
        H,
        lado: 'reverso',
        items: grupo.map((t, k) => {
          const s = espejo(g, k, horizontal, op.borde);
          return { tipo: 'reverso', x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
        }),
      });
    }
  }
  return { paginas, porHoja, hojas: Math.ceil(tablas.length / porHoja), tabla: { w: tw, h: th } };
}

// ---------- Pintar una página ----------
export function pintarPagina(canvas, pagina, baraja, R, k) {
  canvas.width = Math.round(pagina.W * k);
  canvas.height = Math.round(pagina.H * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const it of pagina.items) {
    const x = it.x * k;
    const y = it.y * k;
    const w = it.w * k;
    const h = it.h * k;
    if (it.tipo === 'carta') dibujarCarta(ctx, it.carta, it.numero, it.indice, x, y, w, h, R, baraja.estiloImagen);
    else if (it.tipo === 'reverso') dibujarReverso(ctx, baraja.reverso || {}, x, y, w, h, R);
    else if (it.tipo === 'tabla') dibujarTabla(ctx, baraja, R, it.tabla, it.n, x, y, w, it.etiqueta);
  }
  if (pagina.guias) pintarGuias(ctx, pagina, k);
  return canvas;
}

// Marcas de corte en los márgenes, alineadas con cada orilla.
function pintarGuias(ctx, pagina, k) {
  const g = pagina.guias;
  const usados = pagina.items;
  ctx.save();
  ctx.strokeStyle = '#8a8296';
  ctx.lineWidth = Math.max(1, 0.2 * k);
  const xs = new Set();
  const ys = new Set();
  for (const it of usados) {
    xs.add(it.x);
    xs.add(it.x + it.w);
    ys.add(it.y);
    ys.add(it.y + it.h);
  }
  const izq = g.slots[0].x;
  const arr = g.slots[0].y;
  const der = izq + g.cols * g.iw + (g.cols - 1) * (g.slots[1] ? g.slots[1].x - g.slots[0].x - g.iw : 0);
  const aba = arr + g.rows * g.ih + (g.rows - 1) * (g.slots[g.cols] ? g.slots[g.cols].y - g.slots[0].y - g.ih : 0);
  const largo = 5;
  const sep = 1.2;
  ctx.beginPath();
  for (const x of xs) {
    ctx.moveTo(x * k, (arr - sep) * k);
    ctx.lineTo(x * k, Math.max(0, arr - sep - largo) * k);
    ctx.moveTo(x * k, (aba + sep) * k);
    ctx.lineTo(x * k, Math.min(pagina.H, aba + sep + largo) * k);
  }
  for (const y of ys) {
    ctx.moveTo((izq - sep) * k, y * k);
    ctx.lineTo(Math.max(0, izq - sep - largo) * k, y * k);
    ctx.moveTo((der + sep) * k, y * k);
    ctx.lineTo(Math.min(pagina.W, der + sep + largo) * k, y * k);
  }
  ctx.stroke();
  // Contorno tenue para cortar con tijera
  ctx.setLineDash([1.5 * k, 1.5 * k]);
  ctx.strokeStyle = 'rgba(138,130,150,0.55)';
  ctx.lineWidth = Math.max(1, 0.15 * k);
  for (const it of usados) ctx.strokeRect(it.x * k, it.y * k, it.w * k, it.h * k);
  ctx.restore();
}

// ---------- PDF mínimo con una imagen JPEG por página ----------
const enc = new TextEncoder();
function textoPdf(s) {
  // Cadena UTF-16BE para títulos con acentos
  let hex = 'FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) continue;
    hex += cp.toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

export async function crearPdf(baraja, R, paginas, { titulo = 'Lotería', calidad = 0.9, dpi = DPI, alProgreso } = {}) {
  const k = dpi / 25.4;
  const pt = 72 / 25.4;
  const canvas = document.createElement('canvas');
  const partes = [];
  const offsets = [];
  let pos = 0;
  const poner = (u8) => {
    partes.push(u8);
    pos += u8.length;
  };
  const texto = (s) => poner(enc.encode(s));
  texto('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const total = paginas.length;
  // Objetos: 1 catálogo, 2 páginas, 3 info; luego por página: página, contenido, imagen
  const idPagina = (i) => 4 + i * 3;
  const objeto = (n, cuerpo) => {
    offsets[n] = pos;
    texto(`${n} 0 obj\n${cuerpo}\nendobj\n`);
  };
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, `<< /Type /Pages /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] /Count ${total} >>`);
  objeto(3, `<< /Title ${textoPdf(titulo)} /Producer ${textoPdf('Lotería en Vivo')} >>`);
  for (let i = 0; i < total; i++) {
    alProgreso?.(i, total);
    await new Promise((r) => setTimeout(r, 0));
    const pg = paginas[i];
    pintarPagina(canvas, pg, baraja, R, k);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', calidad));
    const jpg = new Uint8Array(await blob.arrayBuffer());
    const W = (pg.W * pt).toFixed(2);
    const H = (pg.H * pt).toFixed(2);
    const n = idPagina(i);
    objeto(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    const cont = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    objeto(n + 1, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
    offsets[n + 2] = pos;
    texto(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    poner(jpg);
    texto('\nendstream\nendobj\n');
  }
  const nObjs = 4 + total * 3;
  const xref = pos;
  let tabla = `xref\n0 ${nObjs}\n0000000000 65535 f \n`;
  for (let n = 1; n < nObjs; n++) tabla += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  texto(tabla);
  texto(`trailer\n<< /Size ${nObjs} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  alProgreso?.(total, total);
  return new Blob(partes, { type: 'application/pdf' });
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 4000);
}

// Normaliza una baraja local (editor) para imprimir.
export function barajaParaImprimir(b) {
  const porId = new Map();
  b.cartas.forEach((c, i) => porId.set(c.id, { ...c, indice: i, numero: i + 1 }));
  return { ...b, cartas: b.cartas.map((c, i) => porId.get(c.id)), porId };
}
