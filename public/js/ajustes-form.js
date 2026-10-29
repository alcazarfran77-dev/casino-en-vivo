// Formulario de reglas de la partida, compartido entre "Preparar sala" y el diálogo de Reglas.
import { el, vocesEspanol, hablar } from './comun.js';
import { TAMANOS, MODOS, modosDisponibles } from './shared/reglas.js';

const grupo = (titulo, contenido, nota) => el('fieldset', { class: 'grupo' }, el('legend', {}, titulo), contenido, nota ? el('small', {}, nota) : null);

function radios(name, opciones, valor, deshabilitado) {
  return el(
    'div',
    { class: 'opciones', role: 'radiogroup' },
    opciones.map(([v, t]) =>
      el('label', { class: 'opcion' }, el('input', { type: 'radio', name, value: String(v), checked: String(v) === String(valor), disabled: deshabilitado }), el('span', {}, t)),
    ),
  );
}

function interruptor(name, texto, valor, deshabilitado) {
  return el('label', { class: 'interruptor' }, el('input', { type: 'checkbox', name, checked: Boolean(valor), disabled: deshabilitado }), texto);
}

// Pinta el formulario en `cont` y devuelve una función que lee los valores elegidos.
export function formAjustes(cont, a, { enJuego = false, voz } = {}) {
  cont.replaceChildren();
  const bloqueado = enJuego; // tamaño, modo, tablas y victoria solo entre partidas
  const modoCont = el('div');
  const pintarModos = (tam, modo) => {
    const lista = modosDisponibles(Number(tam));
    const m = lista.includes(modo) ? modo : 'llena';
    modoCont.replaceChildren(radios('modo', lista.map((k) => [k, MODOS[k].nombre]), m, bloqueado));
    const desc = el('small', { class: 'desc-modo' }, MODOS[m].desc);
    modoCont.append(desc);
    modoCont.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => (desc.textContent = MODOS[i.value].desc)));
  };

  const tam = grupo('Tamaño de tabla', radios('tam', Object.entries(TAMANOS), a.tam, bloqueado));
  cont.append(tam);
  cont.append(grupo('Cómo se gana', modoCont));
  pintarModos(a.tam, a.modo);
  tam.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => pintarModos(i.value, cont.querySelector('input[name="modo"]:checked')?.value)));

  cont.append(
    grupo(
      'Tablas por jugador',
      radios('maxTablas', [1, 2, 3, 4, 6].map((n) => [n, n === 1 ? '1 tabla' : `Hasta ${n}`]), a.maxTablas, bloqueado),
      'Cada quien elige cuántas juega, hasta este límite.',
    ),
  );
  cont.append(
    grupo(
      'Costo por tabla',
      radios('precio', [[0, 'Gratis'], [500, '$5'], [1000, '$10'], [2500, '$25'], [5000, '$50']], [0, 500, 1000, 2500, 5000].includes(a.precio) ? a.precio : 0, bloqueado),
      'Se cobra del saldo ficticio al empezar la partida. Todo lo recaudado forma el pozo para quien llene su tabla; si nadie gana, se devuelve.',
    ),
  );
  cont.append(
    grupo(
      'Ritmo del gritón',
      radios('velocidad', [[0, 'Yo paso las cartas'], [4, 'Cada 4 s'], [6, 'Cada 6 s'], [8, 'Cada 8 s'], [12, 'Cada 12 s']], [0, 4, 6, 8, 12].includes(a.velocidad) ? a.velocidad : 6),
    ),
  );
  cont.append(
    grupo(
      'Quién declara al ganador',
      radios('victoria', [['auto', 'La app, al instante'], ['grito', 'El jugador aprieta ¡Lotería!']], a.victoria, bloqueado),
      'Con “¡Lotería!” la app revisa la tabla contra las cartas que ya salieron; si es falsa, el jugador queda en pausa unos segundos.',
    ),
  );
  cont.append(grupo('Frijolitos', radios('marcado', [['manual', 'Cada quien los pone'], ['auto', 'Se ponen solos']], a.marcado, bloqueado)));
  cont.append(
    grupo(
      'Al terminar una partida',
      radios('reinicio', [[0, 'Empieza otra cuando yo diga'], [15, 'Otra en 15 s'], [30, 'Otra en 30 s'], [60, 'Otra en 1 min']], [0, 15, 30, 60].includes(a.reinicio) ? a.reinicio : 30, bloqueado),
    ),
  );
  cont.append(
    el(
      'div',
      { class: 'grupo' },
      interruptor('cantarVerso', 'Cantar con verso antes del nombre', a.cantarVerso),
      interruptor('mostrarFaltantes', 'Mostrar cuántas cartas le faltan a cada quien', a.mostrarFaltantes),
      interruptor('permitirArmar', 'Permitir que cada quien arme su propia tabla', a.permitirArmar, bloqueado),
    ),
  );

  // Voz (preferencia de este dispositivo, no viaja al servidor)
  let leerVoz = () => null;
  if (voz) {
    const sel = el('select', { name: 'voz', 'aria-label': 'Voz' });
    const llenar = () => {
      const lista = vocesEspanol();
      sel.replaceChildren(...(lista.length ? lista.map((v) => el('option', { value: v.voiceURI, selected: v.voiceURI === voz.voz }, `${v.name} (${v.lang})`)) : [el('option', { value: '' }, 'Voz del sistema')]));
    };
    llenar();
    if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', llenar);
    const ritmo = el('input', { type: 'range', name: 'ritmoVoz', min: '0.7', max: '1.3', step: '0.05', value: String(voz.ritmo ?? 0.95), 'aria-label': 'Velocidad de la voz', style: { width: '100%' } });
    const probar = el('button', { type: 'button', class: 'btn btn-chico' }, 'Probar voz');
    probar.addEventListener('click', () => hablar('El que le cantó a San Pedro no le volverá a cantar… ¡El Gallo!', { voz: sel.value, ritmo: Number(ritmo.value) }));
    cont.append(
      grupo(
        'Voz del gritón en esta pantalla',
        el('div', {}, el('div', { class: 'voz-fila' }, sel, probar), el('label', { class: 'campo', style: { marginTop: '.6rem' } }, el('span', {}, 'Velocidad'), ritmo)),
        'Si grabaste tu voz para alguna carta en el editor, se usa tu grabación.',
      ),
    );
    leerVoz = () => ({ voz: sel.value || null, ritmo: Number(ritmo.value) });
  }

  return () => {
    const val = (n) => cont.querySelector(`input[name="${n}"]:checked`)?.value;
    const chk = (n) => cont.querySelector(`input[name="${n}"]`)?.checked;
    return {
      ajustes: {
        tam: Number(val('tam')),
        modo: val('modo'),
        maxTablas: Number(val('maxTablas')),
        velocidad: Number(val('velocidad')),
        victoria: val('victoria'),
        marcado: val('marcado'),
        reinicio: Number(val('reinicio')),
        cantarVerso: chk('cantarVerso'),
        mostrarFaltantes: chk('mostrarFaltantes'),
        permitirArmar: chk('permitirArmar'),
        precio: Number(val('precio') ?? 0),
      },
      voz: leerVoz(),
    };
  };
}

export function resumenReglas(a) {
  const ritmo = a.velocidad ? `una carta cada ${a.velocidad} s` : 'tú pasas las cartas';
  const gana = a.victoria === 'auto' ? 'la app declara al ganador' : 'gana quien aprieta ¡Lotería! con su tabla completa';
  const costo = a.precio ? `cada tabla cuesta $${a.precio / 100}` : 'tablas gratis';
  return `${TAMANOS[a.tam]}, ${MODOS[a.modo].nombre.toLowerCase()}, hasta ${a.maxTablas} ${a.maxTablas === 1 ? 'tabla' : 'tablas'} por jugador, ${costo}, ${ritmo}; ${gana}.`;
}
