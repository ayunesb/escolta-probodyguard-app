import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { MAX_CONTENT_WIDTH, Radius, Shadow, Space } from '@/constants/design';
import { AppText, IconButton } from '@/components/ui';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children?: React.ReactNode;
  // Botones de accion, fijos abajo
  footer?: React.ReactNode;
  // false mientras una accion esta en curso: no se puede cerrar a medias
  dismissable?: boolean;
  testID?: string;
}

// Hoja modal del back office: reemplaza los Alert de varios botones (en web el
// polyfill solo ejecuta el primero y Android corta en 3) y Alert.prompt (solo
// iOS). Abajo en el telefono, centrada en web.
export function Sheet({ visible, onClose, title, eyebrow, subtitle, children, footer, dismissable = true, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const close = () => {
    if (dismissable) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.overlay, isWeb ? styles.overlayCenter : styles.overlayBottom]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessible={dismissable}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            isWeb ? styles.sheetCenter : styles.sheetBottom,
            !isWeb ? { paddingBottom: Math.max(insets.bottom, Space.lg) } : null,
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              {eyebrow ? (
                <AppText variant="overline" color={Colors.gold}>
                  {eyebrow}
                </AppText>
              ) : null}
              <AppText variant="title2" accessibilityRole="header">
                {title}
              </AppText>
              {subtitle ? <AppText variant="callout">{subtitle}</AppText> : null}
            </View>
            {dismissable ? <IconButton icon={X} onPress={onClose} accessibilityLabel="Close" size={36} /> : null}
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    paddingHorizontal: Space.md,
  },
  overlayCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.gutter,
  },
  overlayBottom: {
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingTop: Space.xxl,
    ...Shadow.lg,
  },
  sheetCenter: {
    borderRadius: Radius.xl,
    paddingBottom: Space.xxl,
  },
  sheetBottom: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.lg,
    paddingHorizontal: Space.xxl,
    marginBottom: Space.lg,
  },
  headerText: {
    flex: 1,
    gap: Space.xs,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: Space.xxl,
    paddingBottom: Space.lg,
    gap: Space.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: Space.md,
    paddingHorizontal: Space.xxl,
    paddingTop: Space.md,
  },
});
