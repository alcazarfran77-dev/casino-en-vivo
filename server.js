// Casino en Vivo — servidor HTTP + Socket.io
import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import { Casino } from './src/casino.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const INACTIVIDAD_MS = 6 * 60 * 60 * 1000;

const app = express();
const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: 60e6, pingInterval: 10000, pingTimeout: 20000 });

/** @type {Map<string, Casino>} */
const salas = new Map();

function nuevoCodigo() {
  for (let i = 0; i < 1000; i++) {
    const c = String(crypto.randomInt(100000, 1000000));
    if (!salas.has(c)) return c;
  }
  throw new Error('No hay códigos disponibles');
}

function ipsLan() {
  const out = [];
  for (const lista of Object.values(networkInterfaces())) for (const n of lista || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out.sort((a, b) => (b.startsWith('192.168.') ? 1 : 0) - (a.startsWith('192.168.') ? 1 : 0));
}

// ---------------- HTTP ----------------
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use('/fonts/alfa', express.static(path.join(__dirname, 'node_modules/@fontsource/alfa-slab-one'), { maxAge: '30d' }));
app.use('/fonts/rubik', express.static(path.join(__dirname, 'node_modules/@fontsource-variable/rubik'), { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '5m' }));

app.get('/j/:codigo', (req, res) => res.redirect(`/jugar?c=${String(req.params.codigo).replace(/\D/g, '').slice(0, 6)}`));
app.get('/api/info', (req, res) => res.json({ publicUrl: PUBLIC_URL || null, lan: ipsLan().map((ip) => `http://${ip}:${PORT}`) }));
app.get('/api/qr', async (req, res) => {
  const d = String(req.query.d || '').slice(0, 300);
  if (!d) return res.status(400).end();
  try {
    const svg = await QRCode.toString(d, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1a0f2e', light: '#ffffff' } });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  } catch {
    res.status(500).end();
  }
});
app.get('/api/sala/:codigo', (req, res) => {
  const s = salas.get(req.params.codigo);
  if (!s) return res.status(404).json({ ok: false, error: 'No existe una sala con ese código.' });
  res.json({ ok: true, jugadores: s.jugadores.size, mesa: s.mesa?.constructor.juego || null });
});
app.get('/api/sala/:codigo/baraja', (req, res) => {
  const s = salas.get(req.params.codigo);
  if (!s) return res.status(404).json({ ok: false });
  res.set('Cache-Control', 'no-store').json({ ok: true, version: s.versionBaraja, ...s.baraja });
});
app.get('/api/sala/:codigo/img/:clave', (req, res) => {
  const img = salas.get(req.params.codigo)?.imagenes.get(req.params.clave);
  if (!img) return res.status(404).end();
  res.type(img.mime).set('Cache-Control', 'public, max-age=3600').send(img.buf);
});

// ---------------- Socket.io ----------------
io.on('connection', (socket) => {
  /** @type {Casino|null} */
  let sala = null;
  let rol = null;
  let jugador = null;

  const responder = (ack, data) => typeof ack === 'function' && ack(data);
  const envolver = (fn, quien) => (datos, ack) => {
    if (typeof datos === 'function') [ack, datos] = [datos, undefined];
    if (quien === 'anfitrion' && (!sala || rol !== 'anfitrion')) return responder(ack, { ok: false, error: 'Solo el anfitrión puede hacer eso.' });
    if (quien === 'jugador' && (!sala || rol !== 'jugador' || !jugador || jugador.expulsado)) return responder(ack, { ok: false, error: 'No estás en una sala.' });
    try {
      responder(ack, fn(datos || {}) || { ok: true });
    } catch (e) {
      console.error(e);
      responder(ack, { ok: false, error: e.message });
    }
  };
  const anf = (fn) => envolver(fn, 'anfitrion');
  const jug = (fn) => envolver(fn, 'jugador');

  // --- Anfitrión ---
  socket.on('anfitrion:crear', (datos, ack) => {
    try {
      const codigo = nuevoCodigo();
      const s = new Casino(codigo, datos?.ajustes, io);
      if (datos?.baraja) {
        try {
          s.ponerBaraja(datos.baraja);
        } catch {
          /* se queda la tradicional */
        }
      }
      salas.set(codigo, s);
      sala = s;
      rol = 'anfitrion';
      s.socketAnfitrion = socket.id;
      socket.join(codigo);
      responder(ack, { ok: true, codigo, token: s.tokenAnfitrion });
      s.programar();
      console.log(`[casino ${codigo}] abierto`);
    } catch (e) {
      responder(ack, { ok: false, error: e.message });
    }
  });
  socket.on('anfitrion:reanudar', (datos, ack) => {
    const s = salas.get(String(datos?.codigo || ''));
    if (!s || s.tokenAnfitrion !== datos?.token) return responder(ack, { ok: false, error: 'La sala ya no existe.' });
    sala = s;
    rol = 'anfitrion';
    s.socketAnfitrion = socket.id;
    s.toque();
    socket.join(s.codigo);
    responder(ack, { ok: true, codigo: s.codigo });
    s.programar();
  });
  socket.on('anfitrion:ajustes', anf((d) => sala.cambiarAjustes(d)));
  socket.on('anfitrion:mesa', anf((d) => sala.abrirMesa(d)));
  socket.on('anfitrion:cerrarMesa', anf(() => sala.cerrarMesa()));
  socket.on('anfitrion:accion', anf((d) => sala.hostMesa(d.tipo, d.datos)));
  socket.on('anfitrion:baraja', anf((d) => sala.cambiarBaraja(d)));
  socket.on('anfitrion:expulsar', anf((d) => sala.expulsar(String(d.id || ''))));
  socket.on('anfitrion:podio', anf((d) => sala.podio(Boolean(d.mostrar))));
  socket.on('anfitrion:cerrar', anf(() => {
    sala.cerrar();
    salas.delete(sala.codigo);
    console.log(`[casino ${sala.codigo}] cerrado por el anfitrión`);
    return { ok: true };
  }));

  // --- Jugador ---
  socket.on('jugador:unirse', (datos, ack) => {
    const s = salas.get(String(datos?.codigo || '').replace(/\D/g, ''));
    if (!s) return responder(ack, { ok: false, error: 'No existe una sala con ese código.' });
    const r = s.unir(socket, { nombre: datos?.nombre, avatar: datos?.avatar, token: datos?.token });
    if (!r.ok) return responder(ack, r);
    sala = s;
    rol = 'jugador';
    jugador = r.jugador;
    socket.join(s.codigo);
    responder(ack, { ok: true, token: jugador.token, id: jugador.id, nombre: jugador.nombre, reconectado: r.reconectado });
    s.marcar(jugador);
  });
  socket.on('jugador:mesa', jug((d) => sala.accionMesa(jugador, d.tipo, d.datos)));
  socket.on('jugador:solo', jug((d) => sala.accionSolo(jugador, d.clave, d.tipo, d.datos)));
  socket.on('jugador:recargar', jug(() => sala.recargar(jugador)));
  socket.on('jugador:reaccion', jug((d) => sala.reaccionar(jugador, d.emoji)));
  socket.on('jugador:salir', jug(() => sala.expulsar(jugador.id)));

  socket.on('disconnect', () => sala?.desconectar(socket.id));
});

setInterval(() => {
  const ahora = Date.now();
  for (const [codigo, s] of salas) {
    if (ahora - s.actividad > INACTIVIDAD_MS) {
      s.cerrar();
      salas.delete(codigo);
      console.log(`[casino ${codigo}] eliminado por inactividad`);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log('\n  🎰  Casino en Vivo listo (modo demo, dinero ficticio)');
  console.log(`  →  En esta computadora:  http://localhost:${PORT}`);
  for (const u of ipsLan()) console.log(`  →  En tu red WiFi:       ${u}`);
  if (PUBLIC_URL) console.log(`  →  URL pública:          ${PUBLIC_URL}`);
  console.log('');
});
