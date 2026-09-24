// El ESCOLTA escribe aqui el codigo de 6 digitos que le dicta el cliente al
// encontrarse. (Antes el texto decia "pidele el codigo a tu escolta": al
// reves.) Un solo campo oculto detras de 6 casillas: acepta pegar y el
// autocompletado de codigos del sistema.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Fonts, Radius, Shadow, Space } from '@/constants/design';
import { AppText, Button } from '@/components/ui';
import { GlassShield } from '@/components/ui/Media';

const LENGTH = 6;

interface StartCodeInputProps {
  visible: boolean;
  // Debe lanzar un Error con un mensaje mostrable si el codigo no sirve.
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
  clientName?: string | null;
}

export default function StartCodeInput({ visible, onSubmit, onCancel, clientName }: StartCodeInputProps) {
  const { t } = useTranslation(['booking', 'common']);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  const submit = async (value: string) => {
    if (loading) return;
    if (value.length !== LENGTH) {
      setError(t('booking:startCode.enterAll'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(value);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('booking:startCode.noMatch'));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === LENGTH) void submit(digits);
  };

  const cancel = () => {
    if (loading) return;
    setCode('');
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={cancel}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel={t('booking:startCode.close')} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <GlassShield size={78} style={styles.shield} />
            <AppText variant="title2" align="center" accessibilityRole="header">
              {t('booking:startCode.title')}
            </AppText>
            <AppText variant="callout" align="center" style={styles.subtitle}>
              {clientName ? t('booking:startCode.askNamed', { name: clientName }) : t('booking:startCode.ask')}
            </AppText>

            <View style={styles.cells}>
              {Array.from({ length: LENGTH }).map((_, i) => {
                const digit = code[i] ?? '';
                const active = focused && !loading && i === Math.min(code.length, LENGTH - 1);
                return (
                  <View
                    key={i}
                    style={[
                      styles.cell,
                      digit ? styles.cellFilled : null,
                      active ? styles.cellActive : null,
                      error ? styles.cellError : null,
                    ]}
                  >
                    <AppText style={styles.digit} tabular>
                      {digit}
                    </AppText>
                  </View>
                );
              })}
              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={handleChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="number-pad"
                inputMode="numeric"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={LENGTH}
                autoFocus
                caretHidden
                editable={!loading}
                style={styles.hiddenInput}
                testID="start-code-input"
                accessibilityLabel={t('booking:startCode.inputA11y')}
                accessibilityHint={t('booking:startCode.inputHint')}
              />
            </View>

            <AppText
              variant="footnote"
              color={error ? Colors.error : Colors.textTertiary}
              style={styles.status}
              accessibilityLiveRegion="polite"
            >
              {error ?? (loading ? t('booking:startCode.checking') : ' ')}
            </AppText>

            <View style={styles.footer}>
              <Button
                title={t('common:actions.cancel')}
                variant="secondary"
                onPress={cancel}
                disabled={loading}
                style={styles.action}
                accessibilityLabel={t('booking:startCode.cancelA11y')}
                accessibilityHint={t('booking:startCode.cancelHint')}
              />
              <Button
                title={t('booking:startCode.submit')}
                onPress={() => submit(code)}
                loading={loading}
                disabled={code.length !== LENGTH}
                style={styles.action}
                accessibilityLabel={t('booking:startCode.submitA11y')}
                accessibilityHint={t('booking:startCode.submitHint')}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Space.gutter,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    padding: Space.xxl,
    ...Shadow.lg,
  },
  shield: {
    alignSelf: 'center',
    marginTop: -Space.lg,
    marginBottom: -Space.xs,
  },
  subtitle: {
    marginTop: Space.sm,
  },
  cells: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xxl,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    height: 58,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: {
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceLight,
  },
  cellActive: {
    borderColor: Colors.accentLine,
  },
  cellError: {
    borderColor: Colors.error,
  },
  digit: {
    fontFamily: Fonts.semibold,
    fontSize: 24,
    lineHeight: 30,
    color: Colors.textPrimary,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    color: 'transparent',
    fontSize: 1,
  },
  status: {
    marginTop: Space.md,
    minHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.lg,
  },
  action: {
    flex: 1,
  },
});
