// Dialogo de confirmacion con motivo opcional. Sustituye a Alert.prompt (solo
// iOS: en web lanza y en Android no hace nada) y a los Alert.alert de varios
// botones (en web solo corre el primero).
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Colors from '@/constants/colors';
import { Radius, Shadow, Space } from '@/constants/design';
import { AppText, Button, Input } from '@/components/ui';

export interface ActionModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  input?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    hint?: string;
  };
  onConfirm: (value: string) => Promise<void>;
  onClose: () => void;
}

export function ActionModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  cancelLabel,
  input,
  onConfirm,
  onClose,
}: ActionModalProps) {
  const { t } = useTranslation(['booking', 'common']);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async () => {
    if (busy) return;
    const trimmed = value.trim();
    if (input?.required && !trimmed) {
      setError(t('booking:modals.required', { field: input.label.toLowerCase() }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : t('common:errors.generic'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('booking:modals.closeDialog')} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <AppText variant="title2" accessibilityRole="header">
              {title}
            </AppText>
            {message ? (
              <AppText variant="callout" style={styles.message}>
                {message}
              </AppText>
            ) : null}

            {input ? (
              <Input
                label={input.label}
                placeholder={input.placeholder}
                hint={error ? undefined : input.hint}
                error={error}
                value={value}
                onChangeText={(t) => {
                  setValue(t);
                  if (error) setError(null);
                }}
                multiline
                maxLength={input.maxLength ?? 500}
                editable={!busy}
                autoFocus
                containerStyle={styles.input}
                accessibilityLabel={input.label}
              />
            ) : error ? (
              <AppText variant="footnote" color={Colors.error} style={styles.message} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}

            <View style={styles.actions}>
              <Button
                title={cancelLabel ?? t('common:actions.goBack')}
                variant="secondary"
                onPress={close}
                disabled={busy}
                style={styles.action}
              />
              <Button
                title={confirmLabel}
                variant={confirmVariant}
                onPress={submit}
                loading={busy}
                style={styles.action}
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
    maxWidth: 440,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    padding: Space.xxl,
    ...Shadow.lg,
  },
  message: {
    marginTop: Space.sm,
  },
  input: {
    marginTop: Space.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
    marginTop: Space.xxl,
  },
  action: {
    flex: 1,
  },
});
