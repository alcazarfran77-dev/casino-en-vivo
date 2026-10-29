// Página "Imprimir": baraja con reverso para doble cara y tablas para jugar en papel.
import { $, $$, avisar, leer, guardar } from './comun.js';
import { leerBaraja } from './almacen.js';
import { prepararRecursos, planBaraja, planTablas, generarTablas, pintarPagina, crearPdf, descargar, barajaParaImprimir, TAMANOS_CARTA } from './impresion.js';

const form = $('#opciones');
const params = new URLSearchParams(location.search);
let baraja = barajaParaImprimir(await leerBaraja());
let R = await prepararRecursos(baraja);
let tablas = [];
let firmaTablas = '';
let hoja = 0;
let plan = null;
let ocupado = false;

// Restaura las últimas opciones usadas
const previas = leer('loteria:imprimir', {});
for (const [k, v] of Object.entries(previas)) {
  const campos = $$(`[name="${k}"]`, form);
  for (const c of campos) {
    if (c.type === 'radio') c.checked = c.value === String(v);
    else if (c.type === 'checkbox') c.checked = Boolean(v);
    else c.value = v;
  }
}
if (!previas.n) {
  const n = leer('loteria:ajustes', {}).tam;
  if (n) $$('input[name="n"]', form).forEach((i) => (i.checked = i.value === String(n)));
}
if (params.get('que') === 'tablas') $('input[name="que"][value="tablas"]').checked = true;

function opciones() {
  const val = (n) => form.querySelector(`[name="${n}"]:checked`)?.value;
  const num = (n) => Number(form.querySelector(`[name="${n}"]`).value);
  const chk = (n) => form.querySelector(`[name="${n}"]`).checked;
  return {
    que: $('input[name="que"]:checked').value,
    papel: val('papel'),
    tam: val('tam'),
    modo: val('modo'),
    borde: val('borde'),
    ajusteX: num('ajusteX') || 0,
    ajusteY: num('ajusteY') || 0,
    guias: chk('guias'),
    cantidad: Math.max(1, Math.min(100, Math.round(num('cantidad')) || 1)),
    n: Number(val('n')),
    porHoja: Number(val('porHoja')),
    numerar: chk('numerar'),
    reversoTablas: chk('reversoTablas'),
  };
}

function asegurarTablas(op, nuevas = false) {
  const n2 = op.n * op.n;
  if (baraja.cartas.length < n2) return false;
  const firma = `${op.n}|${op.cantidad}|${baraja.cartas.map((c) => c.id).join(',')}`;
  if (nuevas || firma !== firmaTablas) {
    tablas = generarTablas(baraja.cartas.map((c) => c.id), op.n, op.cantidad);
    firmaTablas = firma;
  }
  return true;
}

function armarPlan(op) {
  if (op.que === 'baraja') return planBaraja(baraja, op);
  if (!asegurarTablas(op)) return null;
  return planTablas(baraja, tablas, op.n, { ...op, reverso: op.reversoTablas });
}

let pendiente = null;
function actualizar() {
  clearTimeout(pendiente);
  pendiente = setTimeout(pintarVista, 80);
}

function pintarVista() {
  const op = opciones();
  guardar('loteria:imprimir', { ...op, que: undefined });
  $$('[data-para]').forEach((d) => (d.hidden = d.dataset.para !== op.que));
  const doble = op.que === 'baraja' ? op.modo === 'doble' : op.reversoTablas;
  $('#grupo-borde').hidden = !doble && !(op.que === 'baraja' && op.modo === 'reversos');
  plan = armarPlan(op);
  if (!plan) {
    $('#resumen').textContent = `Tu baraja tiene ${baraja.cartas.length} cartas: no alcanza para tablas de ${op.n} × ${op.n}.`;
    $('#btn-descargar').disabled = true;
    return;
  }
  $('#btn-descargar').disabled = false;
  const paginas = plan.paginas;
  const frentes = paginas.filter((p) => p.lado === 'frente');
  const reversos = paginas.filter((p) => p.lado === 'reverso');
  const base = frentes.length ? frentes : reversos;
  hoja = Math.min(hoja, base.length - 1);

  // Vista previa: frente de la hoja actual y su reverso
  const ancho = Math.min(340, $('.hojas').clientWidth / 2 - 8) * (window.devicePixelRatio || 1);
  const pf = base[hoja];
  const k = ancho / pf.W;
  pintarPagina($('#vista-frente'), pf, baraja, R, k);
  $('#cap-frente').textContent = pf.lado === 'frente' ? 'Frente' : 'Reverso';
  const pr = frentes.length && reversos.length ? reversos[hoja] : null;
  $('#fig-reverso').hidden = !pr;
  if (pr) {
    pintarPagina($('#vista-reverso'), pr, baraja, R, k);
    $('#cap-reverso').textContent = 'Reverso (así queda al voltear la hoja)';
  }
  $('#hoja-num').textContent = `Hoja ${hoja + 1} de ${base.length}`;
  $('#hoja-ant').disabled = hoja === 0;
  $('#hoja-sig').disabled = hoja >= base.length - 1;

  const hojas = base.length;
  if (op.que === 'baraja') {
    const t = TAMANOS_CARTA[op.tam];
    $('#info-tam').textContent = `Caben ${plan.porHoja} por hoja: ${hojas} ${hojas === 1 ? 'hoja' : 'hojas'} para ${baraja.cartas.length} cartas.`;
    $('#resumen').textContent = `${baraja.cartas.length} cartas de ${(t.w / 10).toFixed(1)} × ${(plan.carta.h / 10).toFixed(1)} cm en ${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'}${doble ? `: ${frentes.length} de frente y ${reversos.length} de reverso` : ''}.`;
  } else {
    $('#info-tabla').textContent = `Cada tabla mide ${(plan.tabla.w / 10).toFixed(1)} × ${(plan.tabla.h / 10).toFixed(1)} cm.`;
    $('#resumen').textContent = `${tablas.length} tablas de ${op.n} × ${op.n} en ${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'}.`;
  }
  $('#btn-descargar').textContent = `Descargar PDF (${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'})`;
}

form.addEventListener('input', actualizar);
form.addEventListener('change', actualizar);
$$('input[name="que"]').forEach((i) =>
  i.addEventListener('change', () => {
    hoja = 0;
    actualizar();
  }),
);
$('#btn-otras').addEventListener('click', () => {
  asegurarTablas(opciones(), true);
  pintarVista();
});
$('#hoja-ant').addEventListener('click', () => {
  hoja = Math.max(0, hoja - 1);
  pintarVista();
});
$('#hoja-sig').addEventListener('click', () => {
  hoja++;
  pintarVista();
});
addEventListener('resize', actualizar);

$('#btn-descargar').addEventListener('click', async () => {
  if (ocupado || !plan) return;
  ocupado = true;
  const op = opciones();
  const btn = $('#btn-descargar');
  const barra = $('#progreso');
  btn.disabled = true;
  barra.hidden = false;
  try {
    const titulo = op.que === 'baraja' ? `Lotería: ${baraja.nombre || 'baraja'}` : `Lotería: ${tablas.length} tablas`;
    const blob = await crearPdf(baraja, R, plan.paginas, {
      titulo,
      alProgreso: (i, total) => {
        barra.firstElementChild.style.width = `${(i / total) * 100}%`;
        $('#estado').textContent = i < total ? `Preparando página ${i + 1} de ${total}…` : 'Listo.';
      },
    });
    const limpio = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const nombre = op.que === 'baraja' ? `loteria-baraja-${limpio(baraja.nombre || 'tradicional')}-${op.papel}.pdf` : `loteria-${tablas.length}-tablas-${op.n}x${op.n}-${op.papel}.pdf`;
    descargar(blob, nombre);
    $('#estado').textContent = `Se descargó ${nombre} (${(blob.size / 1024 / 1024).toFixed(1)} MB).`;
  } catch (e) {
    avisar('No se pudo crear el PDF: ' + e.message, 'error', 6000);
    $('#estado').textContent = '';
  } finally {
    ocupado = false;
    btn.disabled = false;
    setTimeout(() => (barra.hidden = true), 1200);
  }
});

pintarVista();
