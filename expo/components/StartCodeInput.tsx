// El ESCOLTA escribe aqui el codigo de 6 digitos que le dicta el cliente al
// encontrarse. (Antes el texto decia "pidele el codigo a tu escolta": al
// reves.) Un solo campo oculto detras de 6 casillas: acepta pegar y el
// autocompletado de codigos del sistema.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
      setError('Enter all 6 digits.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(value);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code doesn't match.");
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
          <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessibilityLabel="Close start code entry" />
          <View style={styles.sheet} accessibilityViewIsModal>
            <GlassShield size={78} style={styles.shield} />
            <AppText variant="title2" align="center" accessibilityRole="header">
              Enter start code
            </AppText>
            <AppText variant="callout" style={styles.subtitle}>
              {clientName
                ? `Ask ${clientName} for their 6-digit code when you meet. The service starts as soon as it matches.`
                : 'Ask your client for their 6-digit code when you meet. The service starts as soon as it matches.'}
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
                accessibilityLabel="Start code, 6 digits"
                accessibilityHint="Enter the 6-digit code your client reads to you"
              />
            </View>

            <AppText
              variant="footnote"
              color={error ? Colors.error : Colors.textTertiary}
              style={styles.status}
              accessibilityLiveRegion="polite"
            >
              {error ?? (loading ? 'Checking the code…' : ' ')}
            </AppText>

            <View style={styles.footer}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={cancel}
                disabled={loading}
                style={styles.action}
                accessibilityLabel="Cancel start code entry"
                accessibilityHint="Closes the start code dialog"
              />
              <Button
                title="Start service"
                onPress={() => submit(code)}
                loading={loading}
                disabled={code.length !== LENGTH}
                style={styles.action}
                accessibilityLabel="Verify start code"
                accessibilityHint="Submits the 6-digit start code to verify"
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
