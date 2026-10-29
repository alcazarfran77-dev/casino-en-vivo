// Juegos del casino. "solo: true" = también se puede jugar por cuenta propia en el celular.
export const CATALOGO = [
  { clave: 'ruleta:americana', juego: 'ruleta', variante: 'americana', nombre: 'Ruleta americana', resumen: 'Cero y doble cero, 38 casillas.', solo: true, icono: '🎡' },
  { clave: 'ruleta:europea', juego: 'ruleta', variante: 'europea', nombre: 'Ruleta europea', resumen: 'Un cero y apuestas anunciadas.', solo: true, icono: '🎡' },
  { clave: 'ruleta:francesa', juego: 'ruleta', variante: 'francesa', nombre: 'Ruleta francesa', resumen: 'Un cero y La Partage en suertes sencillas.', solo: true, icono: '🎡' },
  { clave: 'blackjack:americano', juego: 'blackjack', variante: 'americano', nombre: 'Blackjack americano', resumen: 'El crupier pide con 17 blando y revisa su carta oculta.', solo: true, icono: '🂡' },
  { clave: 'blackjack:premium', juego: 'blackjack', variante: 'premium', nombre: 'Blackjack Premium', resumen: 'Se planta en 17, rendición, Pares perfectos y 21+3.', solo: true, icono: '🂡' },
  { clave: 'videobingo:clasico', juego: 'videobingo', variante: 'clasico', nombre: 'Videobingo', resumen: '4 cartones, 30 bolas y bolas extra.', solo: true, icono: '🎱' },
  { clave: 'loteria:tradicional', juego: 'loteria', variante: 'tradicional', nombre: 'Lotería', resumen: 'Las 54 cartas cantadas; el pozo es para quien llene su tabla.', solo: false, icono: '🎴' },
];
export const porClave = (k) => CATALOGO.find((c) => c.clave === k);

export const AVATARES = ['🦊', '🐯', '🐸', '🦉', '🐙', '🦄', '🐲', '🦜', '🐺', '🐼', '🦁', '🐵', '🐨', '🦩', '🐢', '🐝', '🐞', '🦋', '🌵', '🌶️'];

export const SALDO_INICIAL = 100000; // $1,000 ficticios, en centavos
export const RECARGA_UMBRAL = 5000; // se puede recargar cuando el saldo baja de $50

export function dinero(c, { signo = false } = {}) {
  const neg = c < 0;
  const d = Math.abs(c) / 100;
  const t = d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 });
  return (neg ? '−' : signo && c > 0 ? '+' : '') + '$' + t;
}
