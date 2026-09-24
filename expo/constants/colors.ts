// Paleta de Escolta Pro.
//
// Neutros de piedra calida (no grises frios) y un solo acento: oro champan.
// Las claves de siempre se quedan en hex de 6 digitos a proposito: hay
// pantallas que les concatenan un alfa (`Colors.gold + '20'`), y un rgba ahi
// produce un color invalido. Las claves nuevas con transparencia ya vienen
// resueltas (goldSoft, hairline...) y NO se les concatena nada.
const Colors = {
  // Superficies, de la mas profunda a la mas elevada
  background: '#0A0A09',
  surface: '#141412',
  surfaceLight: '#1C1B19',
  elevated: '#23221F',

  // Acento
  gold: '#C9A45C',
  goldDark: '#A6843F',
  goldLight: '#E2C58C',

  // Texto
  white: '#FFFFFF',
  textPrimary: '#F4F1EA',
  textSecondary: '#A19D94',
  textTertiary: '#6F6B64',
  textOnGold: '#16130D',

  // Lineas
  border: '#282723',
  borderStrong: '#3A3833',

  // Estados (apagados para no competir con el oro)
  success: '#4DAA7F',
  error: '#E0564F',
  warning: '#E08A3C',
  info: '#7C9CD6',

  // Con transparencia ya aplicada: no concatenar
  overlay: 'rgba(0, 0, 0, 0.72)',
  hairline: 'rgba(244, 241, 234, 0.07)',
  goldSoft: 'rgba(201, 164, 92, 0.12)',
  goldLine: 'rgba(201, 164, 92, 0.32)',
  successSoft: 'rgba(77, 170, 127, 0.12)',
  errorSoft: 'rgba(224, 86, 79, 0.12)',
  warningSoft: 'rgba(224, 138, 60, 0.12)',
  infoSoft: 'rgba(124, 156, 214, 0.12)',

  // Alias que una pantalla ya usaba sin que existiera (quedaba undefined)
  primary: '#C9A45C',
};

export default Colors;

export type ThemeColorName = keyof typeof Colors;
