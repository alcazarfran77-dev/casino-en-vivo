// Editor de baraja: imágenes, nombres, versos, reverso, encabezado y voz propia.
import { $, $$, el, cartaEl, reversoEl, cabezaTablaEl, avisar } from './comun.js';
import { barajaPorDefecto, colorDe } from './shared/baraja.js';
import { leerBaraja, guardarBaraja, comprimirImagen, nombreDesdeArchivo, leerAudio, guardarAudio, borrarAudio } from './almacen.js';

let baraja = await leerBaraja();
const audios = new Set();
let guardadoPendiente = null;

function guardarPronto() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(async () => {
    try {
      await guardarBaraja(baraja);
    } catch (e) {
      avisar('No se pudo guardar en este navegador: ' + e.message, 'error', 6000);
    }
  }, 250);
}

const nuevoId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function refrescarAudios() {
  audios.clear();
  await Promise.all(
    baraja.cartas.map(async (c) => {
      if (await leerAudio(c.id)) audios.add(c.id);
    }),
  );
}

// ---------- Pintado ----------
function pintarConteo() {
  const n = baraja.cartas.length;
  const max = n >= 25 ? '5×5' : n >= 16 ? '4×4' : n >= 9 ? '3×3' : null;
  $('#conteo').textContent = `${n} cartas · ${max ? 'alcanza para tablas de hasta ' + max : 'se necesitan al menos 9 cartas'}`;
}

function pintarArriba() {
  const r = baraja.reverso;
  $('#rev-texto').value = r.texto || '';
  $('#rev-c1').value = r.color1;
  $('#rev-c2').value = r.color2;
  $('#rev-quitar').hidden = !r.img;
  $('#vista-reverso').replaceChildren(reversoEl(r, r.img || null));

  const e = baraja.encabezado;
  $('#enc-texto').value = e.texto || '';
  $('#enc-sub').value = e.subtitulo || '';
  $('#enc-color').value = e.color;
  $('#enc-quitar').hidden = !e.img;
  const interior = el('div', { class: 'tabla-interior' }, cabezaTablaEl(e, e.img || null));
  const muestra = el('div', { class: 'tabla', '--n': '4', '--c': e.color }, interior);
  const rej = el('div', { class: 'tabla-rejilla' });
  baraja.cartas.slice(0, 4).forEach((c, i) => rej.append(el('div', { class: 'celda' }, cartaEl(c, { numero: i + 1, imgSrc: c.img || null, estilo: baraja.estiloImagen, indice: i }))));
  interior.append(rej);
  $('#vista-encabezado').replaceChildren(muestra);
  $$('input[name="estilo"]').forEach((i) => (i.checked = i.value === (baraja.estiloImagen || 'arte')));
  $('#nombre-baraja').value = baraja.nombre || '';
}

function pintarRejilla() {
  const rej = $('#rejilla');
  rej.replaceChildren();
  baraja.cartas.forEach((c, i) => {
    const marcas = el('div', { class: 'marcas-carta' });
    if (audios.has(c.id)) marcas.append(el('span', { title: 'Tiene voz grabada' }, 'voz'));
    const b = el('button', { type: 'button', 'aria-label': `Editar ${c.nombre}`, onclick: () => abrirCarta(i) }, marcas, cartaEl(c, { numero: i + 1, imgSrc: c.img || null, estilo: baraja.estiloImagen, indice: i }));
    rej.append(b);
  });
  rej.append(el('button', { type: 'button', class: 'agregar', onclick: agregarCarta }, '+ Agregar carta'));
  pintarConteo();
}

function pintarTodo() {
  pintarArriba();
  pintarRejilla();
}

// ---------- Reverso y encabezado ----------
$('#nombre-baraja').addEventListener('input', (e) => {
  baraja.nombre = e.target.value;
  guardarPronto();
});
$('#rev-texto').addEventListener('input', (e) => {
  baraja.reverso.texto = e.target.value;
  $('#vista-reverso').replaceChildren(reversoEl(baraja.reverso, baraja.reverso.img || null));
  guardarPronto();
});
for (const [id, k] of [['#rev-c1', 'color1'], ['#rev-c2', 'color2']]) {
  $(id).addEventListener('input', (e) => {
    baraja.reverso[k] = e.target.value;
    $('#vista-reverso').replaceChildren(reversoEl(baraja.reverso, baraja.reverso.img || null));
    guardarPronto();
  });
}
$('#rev-img').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  baraja.reverso.img = await comprimirImagen(f, { lado: 720 });
  pintarArriba();
  guardarPronto();
});
$('#rev-quitar').addEventListener('click', () => {
  baraja.reverso.img = false;
  pintarArriba();
  guardarPronto();
});
for (const [id, k] of [['#enc-texto', 'texto'], ['#enc-sub', 'subtitulo'], ['#enc-color', 'color']]) {
  $(id).addEventListener('input', (e) => {
    baraja.encabezado[k] = e.target.value;
    const v = $('#vista-encabezado .tabla');
    v.style.setProperty('--c', baraja.encabezado.color);
    v.querySelector('.tabla-cabeza').replaceWith(cabezaTablaEl(baraja.encabezado, baraja.encabezado.img || null));
    guardarPronto();
  });
}
$('#enc-img').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  baraja.encabezado.img = await comprimirImagen(f, { lado: 320, fondo: '#ffffff' });
  pintarArriba();
  guardarPronto();
});
$('#enc-quitar').addEventListener('click', () => {
  baraja.encabezado.img = false;
  pintarArriba();
  guardarPronto();
});
$$('input[name="estilo"]').forEach((i) =>
  i.addEventListener('change', () => {
    baraja.estiloImagen = i.value;
    pintarTodo();
    guardarPronto();
  }),
);

// ---------- Editar una carta ----------
const dlg = $('#dlg-carta');
let actual = -1;
let grabadora = null;

function pintarVista() {
  const c = baraja.cartas[actual];
  $('#dlg-vista').replaceChildren(cartaEl(c, { numero: actual + 1, imgSrc: c.img || null, estilo: baraja.estiloImagen, indice: actual }));
  $('#c-quitar-img').hidden = !c.img;
  $('#c-color-campo').hidden = Boolean(c.img);
  $('#c-escuchar').hidden = !audios.has(c.id);
  $('#c-quitar-audio').hidden = !audios.has(c.id);
  $('#c-audio-estado').textContent = audios.has(c.id) ? 'Se usará tu grabación en lugar de la voz automática.' : 'Sin grabación: se usa la voz automática.';
}

function abrirCarta(i) {
  actual = i;
  const c = baraja.cartas[i];
  $('#dlg-carta-titulo').textContent = `Carta ${i + 1}`;
  $('#c-nombre').value = c.nombre;
  $('#c-verso').value = c.verso || '';
  $('#c-color').value = colorDe(c, i);
  $('#c-arte').value = c.arte?.startsWith('svg:') ? '' : c.arte || '';
  pintarVista();
  dlg.showModal();
}

$('#c-nombre').addEventListener('input', (e) => {
  baraja.cartas[actual].nombre = e.target.value || 'Sin nombre';
  pintarVista();
  guardarPronto();
});
$('#c-verso').addEventListener('input', (e) => {
  baraja.cartas[actual].verso = e.target.value;
  guardarPronto();
});
$('#c-color').addEventListener('input', (e) => {
  baraja.cartas[actual].color = e.target.value;
  pintarVista();
  guardarPronto();
});
$('#c-arte').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  if (v) baraja.cartas[actual].arte = v;
  pintarVista();
  guardarPronto();
});
for (const id of ['#c-img', '#c-foto']) {
  $(id).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      baraja.cartas[actual].img = await comprimirImagen(f);
      pintarVista();
      guardarPronto();
    } catch (err) {
      avisar(err.message, 'error');
    }
  });
}
$('#c-quitar-img').addEventListener('click', () => {
  baraja.cartas[actual].img = false;
  pintarVista();
  guardarPronto();
});

$('#c-grabar').addEventListener('click', async () => {
  const btn = $('#c-grabar');
  if (grabadora) {
    grabadora.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    avisar('Este navegador no permite grabar audio. Usa “Subir audio”.', 'error');
    return;
  }
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    const trozos = [];
    const id = baraja.cartas[actual].id;
    grabadora = new MediaRecorder(flujo);
    grabadora.ondataavailable = (ev) => ev.data.size && trozos.push(ev.data);
    grabadora.onstop = async () => {
      flujo.getTracks().forEach((t) => t.stop());
      grabadora = null;
      btn.textContent = 'Grabar';
      btn.classList.remove('grabando');
      const blob = new Blob(trozos, { type: trozos[0]?.type || 'audio/webm' });
      await guardarAudio(id, blob);
      audios.add(id);
      pintarVista();
      pintarRejilla();
      avisar('Voz guardada', 'bien');
    };
    grabadora.start();
    btn.textContent = 'Detener';
    btn.classList.add('grabando');
    setTimeout(() => grabadora?.state === 'recording' && grabadora.stop(), 15000);
  } catch {
    avisar('No hubo permiso para usar el micrófono.', 'error');
  }
});
$('#c-audio').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > 3 * 1024 * 1024) return avisar('El audio debe pesar menos de 3 MB.', 'error');
  const id = baraja.cartas[actual].id;
  await guardarAudio(id, f);
  audios.add(id);
  pintarVista();
  pintarRejilla();
});
$('#c-escuchar').addEventListener('click', async () => {
  const blob = await leerAudio(baraja.cartas[actual].id);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  a.onended = () => URL.revokeObjectURL(url);
  a.play().catch(() => avisar('No se pudo reproducir el audio.', 'error'));
});
$('#c-quitar-audio').addEventListener('click', async () => {
  const id = baraja.cartas[actual].id;
  await borrarAudio(id);
  audios.delete(id);
  pintarVista();
  pintarRejilla();
});
$('#c-eliminar').addEventListener('click', () => {
  if (baraja.cartas.length <= 9) return avisar('La baraja necesita al menos 9 cartas.', 'error');
  if (!confirm(`¿Eliminar “${baraja.cartas[actual].nombre}”?`)) return;
  baraja.cartas.splice(actual, 1);
  dlg.close();
  pintarTodo();
  guardarPronto();
});
dlg.addEventListener('close', () => {
  if (grabadora) grabadora.stop();
  pintarTodo();
});

function agregarCarta() {
  if (baraja.cartas.length >= 200) return avisar('Máximo 200 cartas.', 'error');
  baraja.cartas.push({ id: nuevoId(), nombre: `Carta ${baraja.cartas.length + 1}`, verso: '', arte: '🎴' });
  pintarRejilla();
  guardarPronto();
  abrirCarta(baraja.cartas.length - 1);
}
$('#btn-agregar').addEventListener('click', agregarCarta);

// ---------- Imágenes en lote ----------
let lote = [];
$('#lote').addEventListener('change', (e) => {
  lote = [...e.target.files].filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  e.target.value = '';
  if (!lote.length) return;
  $('#lote-info').textContent = `Llegaron ${lote.length} imágenes, ordenadas por nombre de archivo.`;
  $('#lote-desde').max = baraja.cartas.length;
  $('#dlg-lote').showModal();
});
$('#dlg-lote').addEventListener('close', async () => {
  if ($('#dlg-lote').returnValue !== 'ok' || !lote.length) return;
  const modo = $('input[name="lote-modo"]:checked').value;
  if (modo === 'nueva' && lote.length < 9) return avisar('Una baraja nueva necesita al menos 9 imágenes.', 'error', 5000);
  avisar(`Procesando ${lote.length} imágenes…`);
  const imagenes = [];
  for (const f of lote) {
    try {
      imagenes.push({ img: await comprimirImagen(f), nombre: nombreDesdeArchivo(f.name) });
    } catch (err) {
      avisar(err.message, 'error');
    }
  }
  if (modo === 'reemplazar') {
    const desde = Math.max(1, Math.min(baraja.cartas.length, Number($('#lote-desde').value) || 1)) - 1;
    imagenes.forEach((im, k) => {
      const c = baraja.cartas[desde + k];
      if (c) {
        c.img = im.img;
        if ($('#lote-nombres').checked) c.nombre = im.nombre;
      }
      else baraja.cartas.push({ id: nuevoId(), nombre: im.nombre, verso: '', arte: '🎴', img: im.img });
    });
  } else if (modo === 'agregar') {
    imagenes.forEach((im) => baraja.cartas.push({ id: nuevoId(), nombre: im.nombre, verso: '', arte: '🎴', img: im.img }));
  } else {
    baraja.cartas = imagenes.map((im) => ({ id: nuevoId(), nombre: im.nombre, verso: '', arte: '🎴', img: im.img }));
    baraja.nombre = 'Mi baraja';
  }
  baraja.cartas = baraja.cartas.slice(0, 200);
  lote = [];
  await refrescarAudios();
  pintarTodo();
  guardarPronto();
  avisar('Listo: imágenes aplicadas', 'bien');
});

// ---------- Exportar / importar / restaurar ----------
$('#btn-exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ tipo: 'loteria-en-vivo/baraja', version: 1, baraja })], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `baraja-${(baraja.nombre || 'loteria').toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-')}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
});
$('#importar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const datos = JSON.parse(await f.text());
    const b = datos.baraja || datos;
    if (!Array.isArray(b.cartas) || b.cartas.length < 9) throw new Error('El archivo no trae una baraja válida.');
    const base = barajaPorDefecto();
    baraja = {
      ...base,
      ...b,
      reverso: { ...base.reverso, ...(b.reverso || {}) },
      encabezado: { ...base.encabezado, ...(b.encabezado || {}) },
      cartas: b.cartas.slice(0, 200).map((c, i) => ({ id: c.id || nuevoId(), nombre: String(c.nombre || `Carta ${i + 1}`), verso: String(c.verso || ''), arte: c.arte || '🎴', color: c.color, img: c.img || false })),
    };
    await refrescarAudios();
    pintarTodo();
    guardarPronto();
    avisar(`Baraja “${baraja.nombre}” importada`, 'bien');
  } catch (err) {
    avisar(err.message || 'No se pudo leer el archivo.', 'error', 5000);
  }
});
$('#btn-restaurar').addEventListener('click', async () => {
  if (!confirm('¿Volver a la baraja tradicional de 54 cartas? Se pierden las imágenes y nombres que cambiaste.')) return;
  baraja = barajaPorDefecto();
  await refrescarAudios();
  pintarTodo();
  guardarPronto();
});

// Si hay una sala abierta, el botón regresa a ella.
try {
  if (JSON.parse(localStorage.getItem('loteria:anfitrion') || 'null')?.codigo) $('#ir-sala').textContent = 'Volver a mi sala';
} catch {
  /* nada */
}

await refrescarAudios();
pintarTodo();
