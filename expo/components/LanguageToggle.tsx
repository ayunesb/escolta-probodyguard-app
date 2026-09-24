import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Fonts, Motion } from '@/constants/design';
import { AppText, PressableScale } from '@/components/ui';
import { AppLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';

const useNative = Platform.OS !== 'web';

const SHORT: Record<AppLanguage, string> = { en: 'EN', es: 'ES' };

type Props = {
  // compact: "EN | ES" para cabeceras. full: "English | Español" para ajustes.
  size?: 'compact' | 'full';
  style?: StyleProp<ViewStyle>;
};

// Selector de idioma: pastilla de vidrio con un indicador blanco que se desliza
// al idioma activo. Cada nombre va en su propio idioma, como es costumbre.
export function LanguageToggle({ size = 'compact', style }: Props) {
  const { t } = useTranslation();
  const { language, setLanguage } = useAppLanguage();
  const segW = size === 'compact' ? 44 : 104;
  const index = SUPPORTED_LANGUAGES.indexOf(language);
  const x = useRef(new Animated.Value(index * segW)).current;

  useEffect(() => {
    Animated.spring(x, { toValue: index * segW, useNativeDriver: useNative, ...Motion.spring }).start();
  }, [index, segW, x]);

  return (
    <View
      style={[styles.track, size === 'full' ? styles.trackFull : null, style]}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('language.switchTo')}
    >
      <Animated.View pointerEvents="none" style={[styles.thumb, { width: segW, transform: [{ translateX: x }] }]} />
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = lng === language;
        return (
          <PressableScale
            key={lng}
            onPress={() => setLanguage(lng)}
            scaleTo={0.94}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`language.${lng}`)}
            // 34 de alto + 5 arriba y abajo = 44, el minimo tactil.
            hitSlop={{ top: 5, bottom: 5 }}
            style={[styles.segment, { width: segW }]}
          >
            <AppText
              style={[styles.label, size === 'full' ? styles.labelFull : null]}
              color={active ? Colors.textOnAccent : Colors.textSecondary}
            >
              {size === 'compact' ? SHORT[lng] : t(`language.${lng}`)}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(8, 13, 25, 0.62)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : null),
  },
  trackFull: {
    backgroundColor: Colors.glass,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 999,
    backgroundColor: Colors.textPrimary,
  },
  segment: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  label: {
    fontFamily: Fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
  labelFull: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
});
