// Paleta de Escolta Pro — "Midnight & Ice".
//
// Azul medianoche casi negro con luz fria y un solo acento: azul hielo. La
// accion principal es una pastilla blanca (como las referencias de producto
// premium), no un boton de color. Superficies de vidrio esmerilado sobre un
// fondo con resplandores azules.
//
// Las claves en hex de 6 digitos aceptan un sufijo de alfa concatenado
// (`Colors.accent + '20'`). Las que ya traen transparencia (…Soft, …Line,
// glass*, hairline, overlay) NO se concatenan.
const Colors = {
  // Superficies, de la mas profunda a la mas elevada
  background: '#05080F',
  surface: '#0C1220',
  surfaceLight: '#121A2C',
  elevated: '#18223A',

  // Acento: azul hielo
  accent: '#7FA8FF',
  accentDark: '#5C86E0',
  accentLight: '#B9CFFF',

  // Accion principal: pastilla blanca con texto medianoche
  white: '#FFFFFF',
  textOnAccent: '#07101F',

  // Texto
  textPrimary: '#F2F5FA',
  textSecondary: '#97A3BA',
  textTertiary: '#5D6A82',

  // Lineas
  border: '#1A2336',
  borderStrong: '#26314A',

  // Estados
  success: '#46D3A0',
  error: '#FF6B6B',
  warning: '#F3B55A',
  info: '#7FA8FF',

  // Con transparencia ya aplicada: no concatenar
  overlay: 'rgba(3, 6, 12, 0.72)',
  hairline: 'rgba(214, 226, 255, 0.08)',
  accentSoft: 'rgba(127, 168, 255, 0.14)',
  accentLine: 'rgba(127, 168, 255, 0.38)',
  glass: 'rgba(160, 188, 255, 0.055)',
  glassStrong: 'rgba(160, 188, 255, 0.10)',
  glassBorder: 'rgba(200, 216, 255, 0.12)',
  successSoft: 'rgba(70, 211, 160, 0.13)',
  errorSoft: 'rgba(255, 107, 107, 0.13)',
  warningSoft: 'rgba(243, 181, 90, 0.13)',
  infoSoft: 'rgba(127, 168, 255, 0.13)',

  // Alias que una pantalla ya usaba sin que existiera
  primary: '#7FA8FF',
};

export default Colors;

export type ThemeColorName = keyof typeof Colors;
