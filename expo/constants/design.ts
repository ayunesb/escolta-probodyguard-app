import { Platform, TextStyle, ViewStyle } from 'react-native';
import Colors from './colors';

// Familias tal como las registra useFonts en app/_layout.tsx. Cada peso es
// una familia distinta: con fuentes propias no se usa fontWeight, porque
// Android lo ignora y la web lo sintetiza (negrita falsa).
//
// Titulares: Encode Sans Expanded. Una grotesca expandida es la rotulacion de
// la autoridad (chamarras de agencia, rotulos de vehiculos blindados,
// emblemas automotrices): fuerte sin gritar, y poco vista en apps. Negra para
// portadas, negrita para titulos, ligera en oro para el acento. Las etiquetas
// en versalitas usan la misma familia: asi la marca suena igual en todas partes.
// Texto operativo: Geist.
export const Fonts = {
  displayHeavy: 'EncodeSansExpanded_800ExtraBold',
  display: 'EncodeSansExpanded_700Bold',
  displayMedium: 'EncodeSansExpanded_600SemiBold',
  displayLight: 'EncodeSansExpanded_300Light',
  // Compatibilidad: antes era la cursiva de la serif; ahora el acento es el peso ligero
  displayItalic: 'EncodeSansExpanded_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
} as const;

export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';

// Para convertir estilos viejos (`fontWeight: '700'`) a la familia correcta.
export const fontForWeight = (weight?: TextStyle['fontWeight']): string => {
  switch (String(weight ?? '400')) {
    case '500':
      return Fonts.medium;
    case '600':
      return Fonts.semibold;
    case '700':
    case '800':
    case '900':
    case 'bold':
      return Fonts.bold;
    default:
      return Fonts.regular;
  }
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

// Escala tipografica. Titulares en Encode Sans Expanded (mas ancha que una
// serif, por eso los tamanos son menores); todo lo operativo en Geist.
export const Type = {
  display: { fontFamily: Fonts.displayHeavy, fontSize: 33, lineHeight: 38, letterSpacing: -0.9, color: Colors.textPrimary },
  title1: { fontFamily: Fonts.display, fontSize: 27, lineHeight: 32, letterSpacing: -0.6, color: Colors.textPrimary },
  title2: { fontFamily: Fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: Colors.textPrimary },
  title3: { fontFamily: Fonts.semibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: Colors.textPrimary },
  headline: { fontFamily: Fonts.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: Colors.textPrimary },
  body: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 22, color: Colors.textPrimary },
  bodyMedium: { fontFamily: Fonts.medium, fontSize: 15, lineHeight: 22, color: Colors.textPrimary },
  callout: { fontFamily: Fonts.regular, fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  footnote: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18, color: Colors.textSecondary },
  caption: { fontFamily: Fonts.medium, fontSize: 12, lineHeight: 16, color: Colors.textSecondary },
  // Etiqueta en versalitas con tracking abierto, en la familia de titulares:
  // se lee como rotulo de placa. Con moderacion.
  overline: { fontFamily: Fonts.displayMedium, fontSize: 10, lineHeight: 14, letterSpacing: 1.5, textTransform: 'uppercase', color: Colors.textTertiary },
  button: { fontFamily: Fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  // Cifras: montos, contadores, codigos. Siempre tabulares.
  numeric: { fontFamily: Fonts.semibold, fontSize: 15, lineHeight: 20, color: Colors.textPrimary, ...tabular },
  numericLarge: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: Colors.textPrimary, ...tabular },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof Type;

export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  // Margen lateral de pantalla
  gutter: 20,
} as const;

// Radios: mas cerrados por dentro, mas suaves en contenedores.
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

// Sombras tenidas del fondo (negro calido), una sola fuente de luz desde arriba.
const shadow = (y: number, blur: number, opacity: number, elevation: number): ViewStyle =>
  Platform.select<ViewStyle>({
    web: { boxShadow: `0px ${y}px ${blur}px rgba(4, 3, 2, ${opacity})` } as ViewStyle,
    default: {
      shadowColor: '#040302',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
      elevation,
    },
  });

export const Shadow = {
  sm: shadow(2, 8, 0.35, 2),
  md: shadow(8, 24, 0.45, 6),
  lg: shadow(18, 48, 0.55, 12),
  // Brillo del boton dorado
  gold: Platform.select<ViewStyle>({
    web: { boxShadow: '0px 8px 24px rgba(201, 164, 92, 0.22)' } as ViewStyle,
    default: {
      shadowColor: Colors.gold,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
      elevation: 6,
    },
  }),
} as const;

export const Motion = {
  fast: 140,
  base: 220,
  slow: 360,
  // Muelle para press/entradas: firme, sin rebote exagerado
  spring: { damping: 18, stiffness: 260, mass: 0.9 },
} as const;

// Ancho maximo del contenido en web/tablet para que no se estire de lado a lado.
export const MAX_CONTENT_WIDTH = 560;

// Grosor de trazo unico para todos los iconos lucide.
export const ICON_STROKE = 1.75;
