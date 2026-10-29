// Lotería en la tele dentro del casino: preparación, gritón, ganador y pozo.
import { el, $, cartaEl, reversoEl, cartaDeSala, tablaEl, cargarBarajaSala, despertarVoz, confeti, animarCuenta } from '../comun.js';
import { leerBaraja, leerAudio } from '../almacen.js';
import { formAjustes, resumenReglas } from '../ajustes-form.js';
import { dinero, sonido } from '../casino-comun.js';

export function crear(ctx) {
  let raiz = null;
  let estado = null;
  let baraja = null;
  let cargando = null;
  let ultimaCarta = null;
  let finPintado = null;
  let relojFin = null;
  const r = {};
  const enServidor = (t) => (t ? t - ctx.desfase() : null);
  const sec = (nombre) => ['lobby', 'barajando', 'juego', 'fin'].forEach((s) => (r[s].hidden = s !== nombre));

  async function asegurarBaraja(m) {
    if (baraja && baraja.version === m.baraja.version) return true;
    if (!cargando) {
      cargando = cargarBarajaSala(ctx.codigo())
        .then((b) => {
          baraja = b;
          r.mazo.replaceChildren();
          r.anim.replaceChildren();
        })
        .finally(() => (cargando = null));
    }
    await cargando;
    return Boolean(baraja);
  }

  function pintarLobby(e) {
    sec('lobby');
    const listos = e.participantes.filter((p) => p.tablas > 0);
    r.listos.replaceChildren(...(listos.length ? listos.map((p) => el('span', { class: 'chip-jugador' }, el('span', { class: 'av' }, p.avatar), el('span', { class: 'nom' }, p.nombre), el('small', {}, `${p.tablas} ${p.tablas === 1 ? 'tabla' : 'tablas'}`))) : [el('p', { class: 'vacio' }, 'Los jugadores eligen sus tablas en el celular.')]));
    const tablas = listos.reduce((s, p) => s + p.tablas, 0);
    r.pozoLobby.textContent = e.ajustes.precio ? `Pozo estimado ${dinero(e.ajustes.precio * tablas)}` : 'Partida gratis';
    r.precioTexto.textContent = e.ajustes.precio ? `Cada tabla cuesta ${dinero(e.ajustes.precio)}. Quien llene su tabla se lleva todo el pozo.` : 'Sin costo: se juega por el gusto de cantar ¡Lotería!';
    r.btnEmpezar.textContent = listos.length ? `Empezar partida (${listos.length} ${listos.length === 1 ? 'listo' : 'listos'})` : 'Empezar partida';
    r.reglas.textContent = resumenReglas(e.ajustes);
    r.muestra.replaceChildren(el('div', {}, reversoEl(baraja.reverso, baraja.reversoSrc)), ...baraja.cartas.slice(0, 3).map((c) => el('div', {}, cartaDeSala(baraja, c.id))));
  }

  function pintarJuego(e) {
    sec('juego');
    const total = e.baraja.total;
    const quedan = total - e.cantadas.length;
    r.quedan.replaceChildren(el('b', {}, String(e.cantadas.length)), `de ${total} · quedan ${quedan}`);
    if (!r.mazo.childElementCount) for (let i = 0; i < 3; i++) r.mazo.append(reversoEl(baraja.reverso, baraja.reversoSrc));
    r.mazo.style.visibility = quedan ? 'visible' : 'hidden';
    r.pozoJuego.textContent = e.pozo ? `Pozo ${dinero(e.pozo)}` : '';
    if (e.actual && e.actual !== ultimaCarta) mostrarCarta(e.actual, false);
    r.tira.replaceChildren(...e.cantadas.slice(-16).reverse().map((id) => el('div', {}, cartaDeSala(baraja, id))));
    const manual = e.ajustes.velocidad === 0;
    r.btnPausa.hidden = manual;
    r.btnPausa.textContent = e.pausado ? 'Reanudar' : 'Pausar';
    r.pausa.hidden = !e.pausado;
    r.btnSiguiente.textContent = manual || e.pausado ? 'Siguiente carta' : 'Saltar a la siguiente';
    r.cuenta.style.visibility = e.proximaCartaEn ? 'visible' : 'hidden';
    if (e.proximaCartaEn) animarCuenta(r.cuenta, enServidor(e.proximaCartaEn) - e.ajustes.velocidad * 1000, enServidor(e.proximaCartaEn));
    const activos = e.participantes.filter((p) => p.activo);
    if (e.ajustes.mostrarFaltantes) {
      r.tituloLista.textContent = activos.length ? 'A quién le falta poco' : 'Nadie juega en la app';
      const orden = [...activos].sort((a, b) => (a.faltan ?? 99) - (b.faltan ?? 99));
      r.faltan.replaceChildren(...orden.slice(0, 12).map((p) => el('li', { class: p.faltan === 1 ? 'cerca' : p.faltan > 6 ? 'lejos' : '' }, el('span', {}, `${p.avatar} ${p.nombre}`), el('span', { class: 'n' }, p.faltan === 1 ? '¡le falta 1!' : `faltan ${p.faltan}`))));
      if (!activos.length) r.faltan.append(el('li', { class: 'lejos' }, 'Puedes usar la app solo como gritón con tablas de papel.'));
    } else {
      r.tituloLista.textContent = `Jugando: ${activos.length}`;
      r.faltan.replaceChildren(...activos.slice(0, 14).map((p) => el('li', {}, el('span', {}, `${p.avatar} ${p.nombre}`), el('span', { class: 'n' }, `${p.tablas} ${p.tablas === 1 ? 'tabla' : 'tablas'}`))));
    }
  }

  function mostrarCarta(id, animar) {
    const c = baraja.porId.get(id);
    if (!c) return;
    ultimaCarta = id;
    const volteo = el('div', { class: 'volteo' + (animar ? ' atras' : '') }, el('div', { class: 'cara' }, cartaDeSala(baraja, id)), el('div', { class: 'cara cara-atras' }, reversoEl(baraja.reverso, baraja.reversoSrc)));
    r.escena.replaceChildren(volteo);
    if (animar) requestAnimationFrame(() => requestAnimationFrame(() => volteo.classList.remove('atras')));
    r.verso.textContent = estado?.ajustes.cantarVerso && c.verso ? `“${c.verso}”` : '';
  }

  async function cantar(id, numero) {
    const c = baraja?.porId.get(id);
    if (!c || !ctx.voz().activa) return;
    const blob = await leerAudio(id);
    if (blob) {
      speechSynthesis?.cancel();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      a.play().catch(() => ctx.hablar(c.nombre));
      return;
    }
    ctx.hablar((numero === 1 ? '¡Se va y se corre con…! ' : '') + (estado?.ajustes.cantarVerso && c.verso ? c.verso + '… ' : '') + c.nombre);
  }

  function pintarFin(e) {
    sec('fin');
    const clave = `${e.partida}-${e.ganadores.length}`;
    if (finPintado !== clave) {
      finPintado = clave;
      const g = e.ganadores;
      r.grito.textContent = g.length ? '¡Lotería!' : 'Fin de la partida';
      r.ganador.textContent = !g.length ? (e.motivoFin === 'anfitrion' ? 'La terminaste antes de que alguien ganara.' : 'Nadie jugaba en la app.') : g.length === 1 ? `Ganó ${g[0].avatar} ${g[0].nombre}` : `Empate: ${g.map((x) => x.nombre).join(' y ')}`;
      if (e.motivoFin === 'mazo' && g.length) r.ganador.textContent += ' (completó primero)';
      r.pozoFin.textContent = e.pozo ? (g.length ? `Se lleva el pozo de ${dinero(e.pozo)}${g.length > 1 ? ' entre todos' : ''}` : `Se devolvieron las entradas (${dinero(e.pozo)})`) : '';
      r.ganadoras.replaceChildren(...g.slice(0, 2).map((x) => tablaEl(baraja, { id: x.tablaId, celdas: x.celdas }, e.ajustes.tam, { chica: true, patron: x.patron })));
    }
    const marcador = e.participantes.filter((p) => p.victorias > 0).sort((a, b) => b.victorias - a.victorias).slice(0, 8);
    r.marcador.replaceChildren(...(marcador.length ? marcador.map((p) => el('li', {}, el('span', {}, `${p.avatar} ${p.nombre}`), el('b', {}, String(p.victorias)))) : [el('li', {}, 'Todavía nadie gana una partida.')]));
    clearInterval(relojFin);
    const pintarCuenta = () => {
      const fin = enServidor(e.proximaPartidaEn);
      if (!fin) {
        r.cuentaFin.textContent = 'Empieza la siguiente cuando estés listo.';
        r.btnEsperar.hidden = true;
        return;
      }
      r.cuentaFin.replaceChildren('La siguiente partida empieza en ', el('b', {}, `${Math.max(0, Math.ceil((fin - Date.now()) / 1000))} s`));
      r.btnEsperar.hidden = false;
    };
    pintarCuenta();
    if (e.proximaPartidaEn) relojFin = setInterval(pintarCuenta, 250);
  }

  async function empezar() {
    const listos = estado?.participantes.filter((p) => p.tablas > 0).length || 0;
    if (!listos && !confirm('Nadie ha elegido tabla todavía. ¿Empezar de todos modos? Sirve para usar la app solo como gritón con tablas de papel.')) return;
    despertarVoz();
    const x = await ctx.accion('iniciar');
    if (!x.ok) ctx.avisar(x.error || 'No se pudo empezar.', 'error');
  }
  async function siguiente() {
    const x = await ctx.accion('siguiente');
    if (!x.ok && x.error) ctx.avisar(x.error, 'error');
  }
  const pausar = () => estado && estado.ajustes.velocidad > 0 && ctx.accion('pausa', { pausa: !estado.pausado });

  function boton(texto, clase, fn) {
    const b = el('button', { type: 'button', class: 'btn ' + clase }, texto);
    b.addEventListener('click', fn);
    return b;
  }

  return {
    sinLateral: true,
    montar(cont) {
      r.listos = el('div', { class: 'listos' });
      r.pozoLobby = el('div', { class: 'pozo' });
      r.precioTexto = el('p', { class: 'suave' });
      r.btnEmpezar = boton('Empezar partida', 'btn-rosa btn-grande', empezar);
      r.reglas = el('p', { class: 'suave', style: { marginTop: '.8rem' } });
      r.muestra = el('div', { class: 'muestra-baraja', style: { width: 'min(100%, 460px)' } });
      const btnBaraja = boton('Usar mi baraja editada', 'btn-fantasma', async () => {
        const b = await leerBaraja();
        const x = await ctx.casinoBaraja?.(b);
        if (x && !x.ok) ctx.avisar(x.error, 'error');
      });
      r.lobby = el(
        'section',
        { class: 'lot-lobby' },
        el('div', {}, el('h2', {}, 'Lotería'), r.pozoLobby, r.precioTexto, r.listos, el('div', { class: 'fila-botones' }, r.btnEmpezar, btnBaraja, el('a', { class: 'btn btn-fantasma', href: '/imprimir?que=tablas', target: '_blank', rel: 'noopener' }, 'Imprimir tablas de papel')), r.reglas),
        el('div', { style: { display: 'grid', gap: '1rem', justifyItems: 'start' } }, r.muestra, el('div', { class: 'qr-esquina', style: { width: 'min(100%, 360px)' } }, el('div', { class: 'qr' }, el('img', { src: ctx.qrSrc(), alt: 'Código QR para unirse' })), el('div', {}, el('span', { class: 'suave' }, 'Para entrar'), el('b', {}, ctx.codigo().replace(/(\d{3})(\d{3})/, '$1 $2'))))),
      );
      r.anim = el('div', { class: 'baraja-anim' });
      r.barajando = el('section', { class: 'barajando' }, el('div', {}, r.anim, el('h2', {}, 'Barajando…')));
      r.mazo = el('div', { class: 'mazo' });
      r.quedan = el('p', { class: 'quedan' });
      r.pozoJuego = el('div', { class: 'pozo', style: { fontSize: '1.5rem' } });
      r.btnSiguiente = boton('Siguiente carta', 'btn-cempa', siguiente);
      r.btnPausa = boton('Pausar', '', pausar);
      const btnTodas = boton('Ver cartas cantadas', 'btn-fantasma btn-chico', () => {
        const pos = new Map(estado.cantadas.map((id, i) => [id, i + 1]));
        const dlg = el('dialog', {}, el('form', { method: 'dialog' }, el('div', { class: 'dialogo-cuerpo' }, el('h2', {}, 'Cartas cantadas'), el('p', { class: 'suave' }, 'En el orden de la baraja. El número rosa indica en qué turno salió cada una.'), el('div', { class: 'todas' }, ...baraja.cartas.map((c) => el('div', { class: 't' + (pos.has(c.id) ? '' : ' no') }, cartaDeSala(baraja, c.id), pos.has(c.id) ? el('b', {}, String(pos.get(c.id))) : null)))), el('div', { class: 'dialogo-pie' }, el('button', { class: 'btn btn-nopal', value: 'ok' }, 'Cerrar'))));
        dlg.addEventListener('close', () => dlg.remove());
        document.body.append(dlg);
        dlg.showModal();
      });
      const btnTerminar = boton('Terminar partida', 'btn-fantasma btn-chico', () => confirm('¿Terminar esta partida sin ganador? Se devuelven las entradas.') && ctx.accion('terminar'));
      r.escena = el('div', { class: 'escena' });
      r.cuenta = el('div', { class: 'cuenta cuenta-juego' }, el('i'));
      r.pausa = el('p', { class: 'pausa-sello', hidden: true }, 'En pausa');
      r.verso = el('p', { class: 'verso', 'aria-live': 'polite' });
      r.tituloLista = el('h3');
      r.faltan = el('ul', { class: 'lista-faltan' });
      r.tira = el('div', { class: 'tira-cartas' });
      r.juego = el(
        'section',
        { class: 'juego' },
        el('div', { class: 'col-mazo' }, r.mazo, r.quedan, r.pozoJuego, el('div', { class: 'controles' }, r.btnSiguiente, r.btnPausa, btnTodas, btnTerminar), el('p', { class: 'suave', style: { fontSize: '.8rem' } }, 'Barra espaciadora para la siguiente carta, P para pausar.')),
        el('div', { class: 'col-carta' }, r.escena, r.cuenta, r.pausa, r.verso),
        el('aside', { class: 'col-lista' }, r.tituloLista, r.faltan, el('div', { class: 'qr-esquina', style: { marginTop: 'auto' } }, el('div', { class: 'qr' }, el('img', { src: ctx.qrSrc(), alt: 'Código QR para unirse' })), el('div', {}, el('span', { class: 'suave' }, 'Para la siguiente partida'), el('b', {}, ctx.codigo().replace(/(\d{3})(\d{3})/, '$1 $2'))))),
        el('div', { class: 'tira' }, el('span', { class: 'suave' }, 'Ya salieron'), r.tira),
      );
      r.grito = el('p', { class: 'grito' });
      r.ganador = el('p', { class: 'ganador-nombre' });
      r.pozoFin = el('p', { class: 'pozo', style: { fontSize: '1.6rem', margin: '0 0 1rem' } });
      r.ganadoras = el('div', { class: 'tablas-ganadoras' });
      r.marcador = el('ol', { class: 'marcador' });
      r.cuentaFin = el('p', { class: 'cuenta-fin' });
      r.btnEsperar = boton('Esperar', 'btn-fantasma', () => ctx.accion('cancelarReinicio'));
      r.fin = el(
        'section',
        { class: 'fin' },
        el('div', {}, r.grito, r.ganador, r.pozoFin, r.ganadoras),
        el('div', { class: 'hoja' }, el('h2', {}, 'Partidas ganadas'), r.marcador, r.cuentaFin, el('div', { class: 'fila-botones' }, boton('Nueva partida', 'btn-rosa btn-grande', empezar), r.btnEsperar), el('p', { class: 'suave', style: { marginTop: '1rem' } }, 'Mientras tanto, cada quien puede cambiar sus tablas desde el celular.')),
      );
      raiz = el('div', { class: 'vista-loteria' }, r.lobby, r.barajando, r.juego, r.fin);
      cont.replaceChildren(raiz);
      sec('lobby');
    },
    async actualizar(m) {
      estado = m;
      if (!(await asegurarBaraja(m))) return;
      if (m !== estado) return;
      if (m.fase === 'lobby') pintarLobby(m);
      else if (m.fase === 'barajando') {
        sec('barajando');
        if (!r.anim.childElementCount) for (let i = 0; i < 4; i++) r.anim.append(reversoEl(baraja.reverso, baraja.reversoSrc));
        ultimaCarta = null;
        r.escena.replaceChildren();
        r.verso.textContent = '';
      } else if (m.fase === 'jugando') pintarJuego(m);
      else pintarFin(m);
    },
    evento(tipo, d) {
      if (!baraja) return;
      if (tipo === 'carta') {
        sec('juego');
        mostrarCarta(d.id, true);
        cantar(d.id, d.numero);
      } else if (tipo === 'fin' && d.ganadores.length) {
        confeti();
        sonido.gana();
        ctx.hablar(`¡Lotería! Ganó ${d.ganadores.map((g) => g.nombre).join(' y ')}`);
      } else if (tipo === 'falsa') ctx.avisar(`¡Lotería falsa de ${d.nombre}!`, 'error');
    },
    tecla(ev) {
      if (estado?.fase !== 'jugando') return;
      if (ev.key === ' ' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        siguiente();
      } else if (ev.key.toLowerCase() === 'p') pausar();
    },
    notaReglas: (m) => (m.fase === 'jugando' || m.fase === 'barajando' ? 'Durante la partida solo puedes cambiar el ritmo, el verso, los faltantes y la voz. Lo demás, entre partidas.' : ''),
    formReglas(cont, a) {
      return formAjustes(cont, a, { enJuego: estado && (estado.fase === 'jugando' || estado.fase === 'barajando'), voz: ctx.voz() });
    },
    desmontar() {
      clearInterval(relojFin);
    },
  };
}
