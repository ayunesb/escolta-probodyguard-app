import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Colors from '@/constants/colors';
import { Radius, Shadow, Space } from '@/constants/design';
import { registerAlertHost, AlertRequest } from '@/utils/alertWebPolyfill';
import { AppText } from './AppText';
import { Button } from './Button';
import i18n from '@/i18n';

// Dialogo de Alert.alert en web, con el sistema de diseno y todos los
// botones (window.confirm solo sabe de Aceptar/Cancelar). En iOS/Android no
// se monta: ahi Alert.alert ya es nativo.
export function AlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    registerAlertHost((request) => setQueue((q) => [...q, request]));
    return () => registerAlertHost(null);
  }, []);

  const current = queue[0];

  const close = useCallback((onPress?: () => void) => {
    setQueue((q) => q.slice(1));
    // Despues de cerrar, para que un Alert encadenado dentro se encole bien
    if (onPress) setTimeout(onPress, 0);
  }, []);

  if (Platform.OS !== 'web' || !current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  // En fila caben dos etiquetas cortas; si alguna es larga (pasa en espanol),
  // se apilan a todo lo ancho en vez de recortarse.
  const stacked = current.buttons.length > 2 || current.buttons.some((b) => (b.text ?? '').length > 14);
  // Orden: acciones primero; cancelar al final (o a la izquierda si van en fila)
  const actions = current.buttons.filter((b) => b !== cancel);
  const ordered = stacked ? [...actions, ...(cancel ? [cancel] : [])] : [...(cancel ? [cancel] : []), ...actions];
  const primary = actions[actions.length - 1];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => close(cancel?.onPress)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel ? () => close(cancel.onPress) : undefined} accessibilityLabel={i18n.t('common:actions.dismiss')} />
        <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
          <AppText variant="title3">{current.title}</AppText>
          {current.message ? (
            <AppText variant="callout" style={styles.message}>
              {current.message}
            </AppText>
          ) : null}
          <View style={[styles.buttons, stacked ? styles.stacked : styles.row]}>
            {ordered.map((b, i) => (
              <Button
                key={`${b.text}-${i}`}
                title={b.text ?? 'OK'}
                size="md"
                fullWidth={stacked}
                style={stacked ? undefined : styles.rowButton}
                variant={b.style === 'destructive' ? 'danger' : b === cancel ? 'secondary' : b === primary ? 'primary' : 'outline'}
                onPress={() => close(b.onPress)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xxl,
    backgroundColor: Colors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: Space.xxl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    ...Shadow.lg,
  },
  message: {
    marginTop: Space.sm,
  },
  buttons: {
    marginTop: Space.xxl,
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
  },
  rowButton: {
    flex: 1,
  },
  stacked: {
    flexDirection: 'column',
  },
});
