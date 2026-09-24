import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Button, IconButton } from '@/components/ui';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error' | 'gold';

const TONES: Record<NoticeTone, { fg: string; bg: string; border: string; icon: LucideIcon }> = {
  info: { fg: Colors.info, bg: Colors.infoSoft, border: Colors.border, icon: Info },
  success: { fg: Colors.success, bg: Colors.successSoft, border: Colors.border, icon: CircleCheck },
  warning: { fg: Colors.warning, bg: Colors.warningSoft, border: Colors.border, icon: TriangleAlert },
  error: { fg: Colors.error, bg: Colors.errorSoft, border: Colors.border, icon: CircleAlert },
  gold: { fg: Colors.gold, bg: Colors.goldSoft, border: Colors.goldLine, icon: Info },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  message: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  actionLoading?: boolean;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

// Aviso en linea (exito, error con reintento, advertencia). Sustituye los
// Alert de "Success"/"Error" que no aportan nada y en web se ven como
// ventanas del navegador.
export function Notice({ tone = 'info', title, message, icon, actionLabel, onAction, actionLoading, onDismiss, style }: NoticeProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <View
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }, style]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon size={18} color={t.fg} strokeWidth={ICON_STROKE} style={styles.icon} />
      <View style={styles.text}>
        {title ? <AppText variant="headline">{title}</AppText> : null}
        <AppText variant="footnote" color={title ? Colors.textSecondary : Colors.textPrimary}>
          {message}
        </AppText>
        {actionLabel && onAction ? (
          <Button
            title={actionLabel}
            onPress={onAction}
            loading={actionLoading}
            variant="secondary"
            size="sm"
            fullWidth={false}
            style={styles.action}
          />
        ) : null}
      </View>
      {onDismiss ? <IconButton icon={X} onPress={onDismiss} accessibilityLabel="Dismiss" size={30} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    gap: Space.xs,
  },
  action: {
    marginTop: Space.sm,
  },
});
