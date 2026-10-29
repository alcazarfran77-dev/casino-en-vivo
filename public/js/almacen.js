// Guarda la baraja personalizada y los audios del anfitrión en este navegador (IndexedDB).
import { barajaPorDefecto } from './shared/baraja.js';

const DB = 'loteria-en-vivo';
let dbPromesa;

function abrir() {
  if (!dbPromesa) {
    dbPromesa = new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  return dbPromesa;
}

async function op(modo, fn) {
  const db = await abrir();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', modo);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

export const leerKV = (k) => op('readonly', (s) => s.get(k));
export const guardarKV = (k, v) => op('readwrite', (s) => s.put(v, k));
export const borrarKV = (k) => op('readwrite', (s) => s.delete(k));

export async function leerBaraja() {
  try {
    const b = await leerKV('baraja');
    if (b && Array.isArray(b.cartas) && b.cartas.length) return b;
  } catch {
    /* sin IndexedDB: se usa la tradicional */
  }
  return barajaPorDefecto();
}
export const guardarBaraja = (b) => guardarKV('baraja', b);

export const leerAudio = (id) => leerKV('audio:' + id).catch(() => null);
export const guardarAudio = (id, blob) => guardarKV('audio:' + id, blob);
export const borrarAudio = (id) => borrarKV('audio:' + id);

// Reduce una imagen a un tamaño razonable para viajar por la red (JPEG, lado mayor ≤ 640 px).
export function comprimirImagen(archivo, { lado = 640, calidad = 0.84, fondo = '#fbf3de' } = {}) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * esc));
      const h = Math.max(1, Math.round(img.naturalHeight * esc));
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('No se pudo leer la imagen ' + archivo.name));
    };
    img.src = url;
  });
}

export function nombreDesdeArchivo(nombre) {
  const base = nombre.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Carta';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
