import React, { forwardRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText } from './AppText';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  // Elemento a la derecha (unidad, boton, etc.)
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

// Campo de texto con etiqueta, foco dorado y error en linea.
// Si es de contrasena, trae el ojo para mostrarla.
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, icon: Icon, trailing, containerStyle, secureTextEntry, style, onFocus, onBlur, multiline, editable = true, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isSecret = !!secureTextEntry;

  const borderColor = error ? Colors.error : focused ? Colors.accentLine : Colors.glassBorder;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="caption" color={Colors.textSecondary} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          multiline ? styles.fieldMultiline : null,
          { borderColor, backgroundColor: focused ? Colors.glassStrong : Colors.glass },
          !editable ? styles.disabled : null,
        ]}
      >
        {Icon ? (
          <Icon
            size={18}
            color={focused ? Colors.accent : Colors.textTertiary}
            strokeWidth={ICON_STROKE}
            style={multiline ? styles.iconTop : undefined}
          />
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          multiline={multiline}
          secureTextEntry={isSecret && !revealed}
          placeholderTextColor={Colors.textTertiary}
          selectionColor={Colors.accent}
          cursorColor={Colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, multiline ? styles.inputMultiline : null, webNoOutline, style]}
        />
        {isSecret ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? (
              <EyeOff size={18} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
            ) : (
              <Eye size={18} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
            )}
          </Pressable>
        ) : null}
        {trailing}
      </View>
      {error ? (
        <AppText variant="caption" color={Colors.error} style={styles.below} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={Colors.textTertiary} style={styles.below}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const webNoOutline = Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  label: {
    marginBottom: Space.sm,
    letterSpacing: 0.1,
  },
  field: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: Space.md,
  },
  iconTop: {
    marginTop: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: Fonts.regular,
    fontSize: 15.5,
    color: Colors.textPrimary,
    paddingVertical: Platform.OS === 'web' ? 14 : 12,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  disabled: {
    opacity: 0.55,
  },
  below: {
    marginTop: Space.sm,
  },
});
