// Lotería en el celular dentro del casino: elegir o armar tablas, marcar y cantar ¡Lotería!
import { $$, el, cartaDeSala, tablaEl, fichaEl, FICHAS as MARCADORES, cargarBarajaSala, hablar, despertarVoz, animarCuenta, leer, guardar } from '../comun.js';
import { dinero, sonido } from '../casino-comun.js';

export function crear(ctx) {
  let e = null;
  let baraja = null;
  let cargando = null;
  let eligiendo = null;
  let seleccion = [];
  let finCerrado = null;
  let firma = null;
  const marcasLocal = new Map();
  let relojBloqueo = null;
  let relojFin = null;
  let prefs = { voz: false, ficha: 'frijol', ...leer('loteria:prefs', {}) };
  let armado = [];
  const s = {};
  const enServidor = (t) => (t ? t - ctx.desfase() : null);
  const hacer = async (tipo, datos) => {
    const x = await ctx.accion(tipo, datos);
    if (!x.ok && x.error) ctx.avisar(x.error, 'error');
    return x;
  };
  const boton = (texto, clase, fn) => {
    const b = el('button', { type: 'button', class: 'btn ' + clase }, texto);
    b.addEventListener('click', fn);
    return b;
  };
  const mostrar = (n) => ['elegir', 'espera', 'juego', 'fin'].forEach((k) => (s[k].hidden = k !== n));

  async function asegurarBaraja() {
    if (baraja && baraja.version === e.baraja.version) return true;
    if (!cargando) cargando = cargarBarajaSala(ctx.codigo()).then((b) => ((baraja = b), (firma = null))).catch(() => null).finally(() => (cargando = null));
    await cargando;
    return Boolean(baraja);
  }

  function decidir() {
    if ((e.fase === 'jugando' || e.fase === 'barajando') && e.activo) return 'juego';
    if (e.fase === 'fin' && finCerrado !== e.partida) return 'fin';
    if (eligiendo || !e.tablas.length) return 'elegir';
    return 'espera';
  }

  function textoPrecio() {
    return e.ajustes.precio ? `Cada tabla cuesta ${dinero(e.ajustes.precio)} de tu saldo ficticio. Quien llene su tabla se lleva el pozo.` : 'Partida gratis: no cuesta saldo.';
  }

  function banner(texto) {
    const actual = e.actual;
    return el('div', { class: 'tarjeta', style: { display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: '.7rem', alignItems: 'center' } }, actual ? el('div', {}, cartaDeSala(baraja, actual)) : el('div'), el('div', {}, el('b', {}, actual ? baraja.porId.get(actual)?.nombre : 'Barajando…'), el('br'), el('span', { class: 'suave' }, texto)));
  }

  // ---------- Elegir ----------
  function pintarElegir() {
    const max = e.ajustes.maxTablas;
    const ofertas = e.ofertas.length ? e.ofertas : e.tablas;
    if (!seleccion.length && e.tablas.length) seleccion = e.tablas.map((t) => t.id);
    seleccion = seleccion.filter((id) => ofertas.some((t) => t.id === id));
    const enJuego = e.fase === 'jugando' || e.fase === 'barajando';
    const peso = (t) => (t.propia ? 2 : 0) + (e.tablas.some((x) => x.id === t.id) ? 1 : 0);
    const cont = el('div', { class: 'ofertas' });
    for (const t of [...ofertas].sort((a, b) => peso(b) - peso(a))) {
      const b = el('button', { type: 'button', class: 'oferta', 'aria-pressed': String(seleccion.includes(t.id)), 'aria-label': 'Tabla', 'data-id': t.id }, el('span', { class: 'check', 'aria-hidden': 'true' }, '✓'), tablaEl(baraja, t, e.ajustes.tam, { chica: true }), t.propia ? el('span', { class: 'etiqueta' }, 'La que armaste') : e.tablas.some((x) => x.id === t.id) ? el('span', { class: 'etiqueta' }, 'Tu tabla') : null);
      b.addEventListener('click', () => alternar(t.id, cont));
      cont.append(b);
    }
    s.confirmar = boton('', 'btn-rosa btn-grande principal', confirmar);
    s.elegir.replaceChildren(
      enJuego ? banner('Ya hay una partida en curso: tus tablas entran en la siguiente.') : el('div'),
      el('h2', { style: { marginBottom: '.2rem' } }, 'Elige tus tablas'),
      el('p', { class: 'suave', style: { margin: 0 } }, (max === 1 ? 'Toca la tabla con la que quieres jugar. ' : `Puedes jugar con hasta ${max} tablas. `) + textoPrecio()),
      cont,
      el('div', { class: 'barra-acciones' }, boton('Ver otras', 'btn-chico', () => hacer('ofertas')), e.ajustes.permitirArmar ? boton('Armar la mía', 'btn-chico', abrirArmar) : null, boton('Opciones', 'btn-chico btn-fantasma', abrirOpciones), s.confirmar),
    );
    pintarConfirmar();
  }
  function alternar(id, cont) {
    const max = e.ajustes.maxTablas;
    if (seleccion.includes(id)) seleccion = seleccion.filter((x) => x !== id);
    else if (seleccion.length < max) seleccion.push(id);
    else if (max === 1) seleccion = [id];
    else return ctx.avisar(`Máximo ${max} tablas: quita una primero.`);
    $$('.oferta', cont).forEach((b) => b.setAttribute('aria-pressed', String(seleccion.includes(b.dataset.id))));
    pintarConfirmar();
  }
  function pintarConfirmar() {
    const n = seleccion.length;
    s.confirmar.disabled = !n;
    const costo = e.ajustes.precio * n;
    s.confirmar.textContent = n ? `Jugar con ${n} ${n === 1 ? 'tabla' : 'tablas'}${costo ? ` · ${dinero(costo)}` : ''}` : 'Elige al menos una';
  }
  async function confirmar() {
    const x = await hacer('elegir', { ids: seleccion });
    if (!x.ok) return;
    eligiendo = false;
    ctx.vibrar(30);
    pintarTodo();
  }

  // ---------- Armar ----------
  function abrirArmar() {
    armado = [];
    const dlg = el('dialog', { class: 'dlg-armar' });
    const vista = el('div', { class: 'armar-vista' });
    const lista = el('div', { class: 'armar-baraja' });
    const ayuda = el('p', { class: 'suave' });
    const usar = el('button', { type: 'button', class: 'btn btn-nopal', disabled: true }, 'Usar esta tabla');
    const pintarA = () => {
      const n = e.ajustes.tam;
      const n2 = n * n;
      const rej = el('div', { class: 'tabla-rejilla' });
      for (let i = 0; i < n2; i++) {
        const id = armado[i];
        if (id) {
          const b = el('button', { type: 'button', class: 'celda', 'aria-label': `Quitar ${baraja.porId.get(id).nombre}` }, cartaDeSala(baraja, id));
          b.addEventListener('click', () => (armado.splice(i, 1), pintarA()));
          rej.append(b);
        } else rej.append(el('div', { class: 'celda-vacia' }));
      }
      vista.replaceChildren(el('div', { class: 'tabla', '--n': String(n), '--c': baraja.encabezado?.color || '#e4007c' }, el('div', { class: 'tabla-interior' }, rej)));
      lista.replaceChildren(
        ...baraja.cartas.map((c) => {
          const usada = armado.includes(c.id);
          const b = el('button', { type: 'button', 'aria-pressed': String(usada), 'aria-label': c.nombre }, cartaDeSala(baraja, c.id));
          b.addEventListener('click', () => {
            if (usada) armado = armado.filter((x) => x !== c.id);
            else if (armado.length < n2) armado.push(c.id);
            pintarA();
          });
          return b;
        }),
      );
      usar.disabled = armado.length !== n2;
      ayuda.textContent = `Llevas ${armado.length} de ${n2} figuras. Toca una casilla de tu tabla para quitarla.`;
    };
    usar.addEventListener('click', async () => {
      const x = await hacer('armar', { celdas: armado });
      if (!x.ok) return;
      dlg.close();
      if (seleccion.length >= e.ajustes.maxTablas) seleccion.shift();
      seleccion.push(x.tablaId);
      ctx.avisar('Tu tabla quedó lista. Confirma para jugar con ella.', 'bien');
    });
    const azar = boton('Llenar al azar', 'btn-fantasma', () => {
      const n2 = e.ajustes.tam ** 2;
      armado = [...armado, ...baraja.cartas.map((c) => c.id).filter((id) => !armado.includes(id)).sort(() => Math.random() - 0.5)].slice(0, n2);
      pintarA();
    });
    dlg.append(el('form', { method: 'dialog' }, el('div', { class: 'dialogo-cuerpo' }, el('h2', {}, 'Arma tu tabla'), ayuda, vista, lista), el('div', { class: 'dialogo-pie' }, azar, boton('Borrar', 'btn-fantasma', () => ((armado = []), pintarA())), el('button', { class: 'btn btn-fantasma', value: 'cancelar' }, 'Cancelar'), usar)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    pintarA();
    dlg.showModal();
  }

  // ---------- Opciones ----------
  function abrirOpciones() {
    const dlg = el('dialog');
    const voz = el('input', { type: 'checkbox', checked: prefs.voz });
    const fichas = el('div', { class: 'opciones' }, ...Object.entries(MARCADORES).map(([k, f]) => el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'ficha', value: k, checked: prefs.ficha === k }), el('span', {}, f.nombre))));
    const pdf = boton('Descargar mis tablas para imprimir', '', async () => {
      if (!e.tablas.length) return ctx.avisar('Primero elige tus tablas.', 'error');
      pdf.disabled = true;
      pdf.textContent = 'Preparando PDF…';
      try {
        const imp = await import('../impresion.js');
        const cartas = baraja.cartas.map((c, i) => ({ ...c, img: c.img ? baraja.imgDe(c) : false, indice: i, numero: i + 1 }));
        const b = { ...baraja, cartas, porId: new Map(cartas.map((c) => [c.id, c])), reverso: { ...baraja.reverso, img: baraja.reversoSrc || false }, encabezado: { ...baraja.encabezado, img: baraja.encabezadoSrc || false } };
        const R = await imp.prepararRecursos(b);
        const nombre = ctx.yo().nombre;
        const tablas = e.tablas.map((t, k) => ({ ...t, numero: k + 1, etiqueta: e.tablas.length > 1 ? `${nombre}, tabla ${k + 1}` : nombre }));
        const plan = imp.planTablas(b, tablas, e.ajustes.tam, { papel: 'carta', porHoja: tablas.length === 1 ? 1 : 2, numerar: true, guias: true });
        const blob = await imp.crearPdf(b, R, plan.paginas, { titulo: `Tablas de ${nombre}` });
        imp.descargar(blob, `tablas-${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`);
      } catch (err) {
        ctx.avisar('No se pudo crear el PDF: ' + err.message, 'error');
      } finally {
        pdf.disabled = false;
        pdf.textContent = 'Descargar mis tablas para imprimir';
      }
    });
    dlg.append(el('form', { method: 'dialog' }, el('div', { class: 'dialogo-cuerpo' }, el('h2', {}, 'Opciones de lotería'), el('label', { class: 'interruptor' }, voz, 'Escuchar al gritón en este celular'), el('div', { class: 'campo' }, el('span', { class: 'campo-titulo' }, 'Con qué marcas tus cartas'), fichas), pdf), el('div', { class: 'dialogo-pie' }, el('button', { class: 'btn btn-nopal', value: 'ok' }, 'Listo'))));
    dlg.addEventListener('close', () => {
      prefs = { voz: voz.checked, ficha: dlg.querySelector('input[name="ficha"]:checked')?.value || 'frijol' };
      guardar('loteria:prefs', prefs);
      if (prefs.voz) despertarVoz();
      firma = null;
      dlg.remove();
      pintarTodo();
    });
    document.body.append(dlg);
    dlg.showModal();
  }

  // ---------- Espera ----------
  function pintarEspera() {
    const enJuego = e.fase === 'jugando' || e.fase === 'barajando';
    const n = e.participantes.filter((p) => p.tablas > 0).length;
    s.espera.replaceChildren(
      enJuego ? banner(`${e.cantadas.length} de ${e.baraja.total} cartas`) : el('div'),
      el('div', { style: { textAlign: 'center' } }, el('h2', {}, enJuego ? 'Juegas en la siguiente' : `¡Listo, ${ctx.yo().nombre}!`), el('p', { class: 'suave' }, enJuego ? 'Puedes ver cómo va la partida mientras tanto.' : e.fase === 'fin' ? 'La siguiente partida está por empezar.' : 'Esperando a que el anfitrión empiece la partida.'), el('p', { class: 'suave', style: { fontSize: '.9rem' } }, textoPrecio())),
      el('div', { class: 'mis-tablas-mini' }, ...e.tablas.map((t) => tablaEl(baraja, t, e.ajustes.tam, { chica: true }))),
      el(
        'div',
        { class: 'fila-botones', style: { justifyContent: 'center' } },
        boton('Cambiar mis tablas', '', async () => {
          eligiendo = true;
          seleccion = e.tablas.map((t) => t.id);
          if (e.ofertas.length <= e.tablas.length) await hacer('ofertas');
          pintarTodo();
        }),
        boton('Opciones', 'btn-fantasma', abrirOpciones),
      ),
      el('p', { class: 'suave', style: { textAlign: 'center', marginTop: '1rem' } }, n > 1 ? `${n} jugadores ya tienen tablas.` : ''),
    );
  }

  // ---------- Juego ----------
  function construirTablas() {
    firma = `${e.partida}|${e.baraja.version}|${prefs.ficha}|${e.tablas.map((t) => t.id).join(',')}`;
    marcasLocal.clear();
    for (const t of e.tablas) marcasLocal.set(t.id, new Set(e.marcas?.[t.id] || []));
    s.carrusel.replaceChildren(...e.tablas.map((t) => tablaEl(baraja, t, e.ajustes.tam, { marcas: e.ajustes.marcado === 'auto' ? null : marcasLocal.get(t.id), ficha: prefs.ficha, onCelda: (i, celda) => tocarCelda(t, i, celda) })));
    s.pestanas.replaceChildren();
    if (e.tablas.length > 1) {
      e.tablas.forEach((t, k) => {
        const b = el('button', { type: 'button', class: 'btn btn-chico', 'aria-current': String(k === 0) }, `Tabla ${k + 1}`);
        b.addEventListener('click', () => s.carrusel.children[k].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
        s.pestanas.append(b);
      });
    }
    s.carrusel.onscroll = () => {
      const k = Math.round(s.carrusel.scrollLeft / Math.max(1, s.carrusel.clientWidth));
      $$('button', s.pestanas).forEach((b, i) => b.setAttribute('aria-current', String(i === k)));
    };
  }
  function sincronizarFichas(animar) {
    const auto = e.ajustes.marcado === 'auto';
    const cantadas = new Set(e.cantadas);
    for (const t of e.tablas) {
      const nodo = s.carrusel.querySelector(`.tabla[data-id="${t.id}"]`);
      if (!nodo) continue;
      const marcas = marcasLocal.get(t.id) || new Set();
      $$('.celda', nodo).forEach((celda, i) => {
        const debe = auto ? cantadas.has(t.celdas[i]) : marcas.has(i);
        const tiene = celda.querySelector('.ficha');
        if (debe && !tiene) celda.append(fichaEl(prefs.ficha, animar, i + t.id.length));
        else if (!debe && tiene) tiene.remove();
      });
    }
  }
  async function tocarCelda(t, i, celda) {
    if (e.ajustes.marcado === 'auto' || e.fase !== 'jugando') return;
    const marcas = marcasLocal.get(t.id);
    const puesto = !marcas.has(i);
    if (puesto && !e.cantadas.includes(t.celdas[i])) {
      celda.classList.remove('temblor');
      void celda.offsetWidth;
      celda.classList.add('temblor');
      return;
    }
    if (puesto) marcas.add(i);
    else marcas.delete(i);
    sincronizarFichas(true);
    const x = await ctx.accion('marcar', { tablaId: t.id, i, puesto });
    if (!x.ok) {
      if (puesto) marcas.delete(i);
      else marcas.add(i);
      sincronizarFichas(false);
    }
  }
  function pintarJuego() {
    if (firma !== `${e.partida}|${e.baraja.version}|${prefs.ficha}|${e.tablas.map((t) => t.id).join(',')}`) construirTablas();
    sincronizarFichas(true);
    const actual = e.actual && e.fase === 'jugando' ? baraja.porId.get(e.actual) : null;
    if (actual && s.carta.dataset.id !== actual.id) {
      s.carta.dataset.id = actual.id;
      s.carta.replaceChildren(el('div', { class: 'cara' }, cartaDeSala(baraja, actual.id)));
    } else if (!actual) {
      s.carta.dataset.id = '';
      s.carta.replaceChildren();
    }
    s.nombre.textContent = actual ? actual.nombre : 'Barajando…';
    const mio = e.participantes.find((p) => p.id === ctx.yo().id);
    s.meta.replaceChildren(e.fase === 'jugando' ? `${e.cantadas.length} de ${e.baraja.total}` : 'Prepárate…');
    if (mio?.faltan != null && e.fase === 'jugando') s.meta.append(el('span', { class: 'pildora' }, mio.faltan === 0 ? '¡ya la tienes!' : mio.faltan === 1 ? 'te falta 1' : `te faltan ${mio.faltan}`));
    if (e.pozo) s.meta.append(el('span', { class: 'pildora', style: { background: 'var(--oro)', color: 'var(--tinta)' } }, `Pozo ${dinero(e.pozo)}`));
    if (e.pausado) s.meta.append(el('span', { class: 'pildora', style: { background: 'var(--papel)', color: 'var(--tinta)' } }, 'en pausa'));
    s.cuenta.style.visibility = e.proximaCartaEn ? 'visible' : 'hidden';
    if (e.proximaCartaEn) animarCuenta(s.cuenta, enServidor(e.proximaCartaEn) - e.ajustes.velocidad * 1000, enServidor(e.proximaCartaEn));
    const grito = e.ajustes.victoria === 'grito';
    s.btnLoteria.hidden = !grito;
    pintarBloqueo();
    s.ayuda.textContent = e.ajustes.marcado === 'auto' ? 'Tus cartas se marcan solas.' : grito ? 'Pon tus frijolitos y aprieta ¡Lotería! cuando completes tu tabla.' : 'Toca las cartas que van saliendo para ponerles un frijolito.';
  }
  function pintarBloqueo() {
    clearInterval(relojBloqueo);
    const b = s.btnLoteria;
    const paso = () => {
      const resta = Math.ceil((e.bloqueadoHasta - Date.now()) / 1000);
      if (resta > 0) {
        b.disabled = true;
        b.textContent = `Espera ${resta} s`;
      } else {
        b.disabled = e.fase !== 'jugando';
        b.textContent = '¡Lotería!';
        clearInterval(relojBloqueo);
      }
    };
    paso();
    if (e.bloqueadoHasta > Date.now()) relojBloqueo = setInterval(paso, 250);
  }

  // ---------- Fin ----------
  function pintarFin() {
    const g = e.ganadores;
    const yo = ctx.yo();
    const gane = g.find((x) => x.jugadorId === yo.id);
    const muestra = gane || g[0];
    const cuenta = el('p', { class: 'suave' });
    clearInterval(relojFin);
    const tick = () => {
      const fin = enServidor(e.proximaPartidaEn);
      cuenta.textContent = fin ? `La siguiente empieza en ${Math.max(0, Math.ceil((fin - Date.now()) / 1000))} s` : 'El anfitrión arranca la siguiente partida.';
    };
    tick();
    if (e.proximaPartidaEn) relojFin = setInterval(tick, 250);
    s.fin.replaceChildren(
      el(
        'div',
        { class: 'resultado' },
        el('p', { class: 'grito' }, gane ? '¡Lotería!' : g.length ? '¡Ya cantaron!' : 'Fin de la partida'),
        el('h2', {}, gane ? (g.length > 1 ? `¡Ganaste! Empate con ${g.filter((x) => x !== gane).map((x) => x.nombre).join(' y ')}` : '¡Ganaste esta partida!') : g.length ? `Ganó ${g.map((x) => x.nombre).join(' y ')}` : 'Nadie completó su tabla.'),
        gane && gane.premio ? el('p', { class: 'cifra-cel' }, `+${dinero(gane.premio)}`) : e.pozo && !g.length ? el('p', { class: 'suave' }, 'Se devolvieron las entradas.') : null,
        muestra ? tablaEl(baraja, { id: muestra.tablaId, celdas: muestra.celdas }, e.ajustes.tam, { chica: true, patron: muestra.patron }) : el('div'),
        cuenta,
        el(
          'div',
          { class: 'fila-botones', style: { justifyContent: 'center' } },
          e.tablas.length ? boton('Seguir con mis tablas', 'btn-rosa', () => ((finCerrado = e.partida), pintarTodo())) : null,
          boton('Cambiar tablas', '', async () => {
            finCerrado = e.partida;
            eligiendo = true;
            seleccion = e.tablas.map((t) => t.id);
            await hacer('ofertas');
            pintarTodo();
          }),
        ),
      ),
    );
  }

  async function pintarTodo() {
    if (!e || !(await asegurarBaraja())) return;
    if (eligiendo === null) eligiendo = !e.tablas.length;
    const p = decidir();
    mostrar(p);
    if (p === 'elegir') pintarElegir();
    else if (p === 'espera') pintarEspera();
    else if (p === 'juego') pintarJuego();
    else pintarFin();
  }

  return {
    montar(cont) {
      s.elegir = el('section', { class: 'cel-lot' });
      s.espera = el('section', { class: 'cel-lot' });
      s.fin = el('section', { class: 'cel-lot' });
      s.carta = el('div', { class: 'carta-actual' });
      s.nombre = el('p', { class: 'nombre' }, 'Barajando…');
      s.meta = el('p', { class: 'meta' });
      s.cuenta = el('div', { class: 'cuenta' }, el('i'));
      s.pestanas = el('div', { class: 'pestanas' });
      s.carrusel = el('div', { class: 'carrusel' });
      s.ayuda = el('p', { class: 'suave', style: { textAlign: 'center', margin: '.6rem 0 0' } });
      s.btnLoteria = el('button', { type: 'button', class: 'btn btn-rosa btn-loteria', hidden: true }, '¡Lotería!');
      s.btnLoteria.addEventListener('click', async () => {
        const x = await ctx.accion('loteria');
        if (x.ok) return;
        ctx.vibrar([80, 60, 80]);
        ctx.avisar(x.error || 'Todavía no completas.', 'error', 3500);
      });
      s.juego = el('section', { class: 'cel-lot' }, el('div', { class: 'cantando' }, s.carta, el('div', {}, s.nombre, s.meta, s.cuenta)), s.pestanas, s.carrusel, s.ayuda, s.btnLoteria, el('div', { class: 'fila-botones', style: { justifyContent: 'center', marginTop: '.6rem' } }, boton('Opciones', 'btn-chico btn-fantasma', abrirOpciones)));
      cont.replaceChildren(s.elegir, s.espera, s.juego, s.fin);
      mostrar('elegir');
    },
    actualizar(estado) {
      const nueva = e && estado.partida !== e.partida;
      e = estado;
      if (nueva) {
        eligiendo = false;
        finCerrado = null;
      }
      pintarTodo();
    },
    evento(tipo, d) {
      if (tipo === 'carta' && prefs.voz && baraja) {
        const c = baraja.porId.get(d.id);
        if (c) hablar((d.numero === 1 ? '¡Se va y se corre con…! ' : '') + (e?.ajustes.cantarVerso && c.verso ? c.verso + '… ' : '') + c.nombre);
      } else if (tipo === 'fin' && d.ganadores.some((g) => g.jugadorId === ctx.yo().id)) {
        ctx.confeti(160);
        sonido.grande();
        ctx.vibrar([200, 80, 200, 80, 400]);
      } else if (tipo === 'falsa' && d.nombre !== ctx.yo().nombre) ctx.avisar(`¡Lotería falsa de ${d.nombre}!`);
    },
    desmontar() {
      clearInterval(relojBloqueo);
      clearInterval(relojFin);
    },
  };
}
