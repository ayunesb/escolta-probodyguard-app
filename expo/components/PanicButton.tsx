import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { CircleCheck, CircleAlert, HeartPulse, LifeBuoy, PhoneCall, ShieldAlert, Siren, TriangleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Shadow, Space } from '@/constants/design';
import { AppText, Button, PressableScale } from '@/components/ui';
import { Notice } from '@/components/backoffice/Notice';
import { Sheet } from '@/components/backoffice/Sheet';
import { emergencyService, EmergencyType } from '@/services/emergencyService';
import { logger } from '@/utils/logger';

interface PanicButtonProps {
  userId: string;
  bookingId?: string;
  size?: 'small' | 'medium' | 'large';
  onAlertTriggered?: (alertId: string) => void;
}

const OPTIONS: { type: EmergencyType; title: string; subtitle: string; icon: LucideIcon; a11y: string; hint: string }[] = [
  {
    type: 'panic',
    title: 'Panic',
    subtitle: 'Immediate danger',
    icon: Siren,
    a11y: 'Panic - Immediate danger',
    hint: 'Alerts Escolta Pro operations that you are in immediate danger',
  },
  {
    type: 'sos',
    title: 'SOS',
    subtitle: 'Need urgent help',
    icon: LifeBuoy,
    a11y: 'SOS - Need urgent help',
    hint: 'Alerts Escolta Pro operations that you need urgent help',
  },
  {
    type: 'medical',
    title: 'Medical',
    subtitle: 'Medical emergency',
    icon: HeartPulse,
    a11y: 'Medical emergency',
    hint: 'Alerts Escolta Pro operations to a medical emergency. Call 911 for an ambulance.',
  },
  {
    type: 'security',
    title: 'Security',
    subtitle: 'Security threat',
    icon: ShieldAlert,
    a11y: 'Security threat',
    hint: 'Alerts Escolta Pro operations to a security threat',
  },
];

type Phase = 'choose' | 'sending' | 'sent' | 'failed';

async function call911() {
  try {
    await Linking.openURL('tel:911');
  } catch (error) {
    logger.error('[PanicButton] Could not open the dialer', error);
  }
}

export default function PanicButton({ userId, bookingId, size = 'medium', onAlertTriggered }: PanicButtonProps) {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>('choose');
  const [lastType, setLastType] = useState<EmergencyType>('panic');
  const [locationShared, setLocationShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setPhase('choose');
    setError(null);
    setVisible(true);
  };

  const close = () => {
    if (phase === 'sending') return;
    setVisible(false);
  };

  const send = async (type: EmergencyType) => {
    setLastType(type);
    setPhase('sending');
    setError(null);
    const result = await emergencyService.triggerPanicButton(userId, bookingId, type);
    if (result.success && result.alertId) {
      setLocationShared(result.locationShared);
      setPhase('sent');
      onAlertTriggered?.(result.alertId);
    } else {
      setError(result.error ?? 'The alert could not be sent.');
      setPhase('failed');
    }
  };

  const buttonSize = size === 'small' ? 60 : size === 'large' ? 100 : 80;
  const iconSize = size === 'small' ? 24 : size === 'large' ? 40 : 30;

  return (
    <>
      <PressableScale
        onPress={open}
        scaleTo={0.92}
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Emergency SOS button"
        accessibilityHint="Opens emergency options: alert Escolta Pro operations or call 911"
        style={[styles.trigger, { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 }]}
      >
        <TriangleAlert size={iconSize} color={Colors.white} strokeWidth={2.25} />
        <AppText style={styles.triggerText}>SOS</AppText>
      </PressableScale>

      <Sheet
        visible={visible}
        onClose={close}
        dismissable={phase !== 'sending'}
        eyebrow="Emergency"
        title={phase === 'sent' ? 'Operations alerted' : phase === 'failed' ? 'Alert not confirmed' : 'Get help now'}
        testID="panic-sheet"
        footer={
          phase === 'sent' ? (
            <Button title="Done" variant="secondary" onPress={close} />
          ) : phase === 'failed' ? (
            <>
              <Button title="Cancel" variant="secondary" onPress={close} style={styles.flex} />
              <Button title="Try again" variant="outline" onPress={() => send(lastType)} style={styles.flex} />
            </>
          ) : phase === 'choose' ? (
            <Button title="Cancel" variant="secondary" onPress={close} accessibilityLabel="Cancel emergency alert" />
          ) : null
        }
      >
        <Button
          title="Call 911"
          icon={PhoneCall}
          variant="danger"
          size="lg"
          onPress={call911}
          accessibilityLabel="Call 911 emergency services"
          accessibilityHint="Opens your phone dialer with 911"
        />

        {phase === 'choose' ? (
          <>
            <AppText variant="callout">
              For police, ambulance or fire, call 911. To alert the Escolta Pro operations team, choose what is happening —
              your location is attached if your device can share it.
            </AppText>
            <View style={styles.options}>
              {OPTIONS.map((opt) => (
                <PressableScale
                  key={opt.type}
                  onPress={() => send(opt.type)}
                  scaleTo={0.98}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={opt.a11y}
                  accessibilityHint={opt.hint}
                  hoverStyle={{ borderColor: Colors.borderStrong }}
                  style={styles.option}
                >
                  <View style={styles.optionIcon}>
                    <opt.icon size={20} color={Colors.error} strokeWidth={ICON_STROKE} />
                  </View>
                  <View style={styles.optionText}>
                    <AppText variant="headline">{opt.title}</AppText>
                    <AppText variant="footnote">{opt.subtitle}</AppText>
                  </View>
                </PressableScale>
              ))}
            </View>
          </>
        ) : phase === 'sending' ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={Colors.accent} />
            <AppText variant="bodyMedium">Alerting Escolta Pro operations…</AppText>
          </View>
        ) : phase === 'sent' ? (
          <View style={styles.statusBlock} accessibilityLiveRegion="polite">
            <View style={styles.status}>
              <CircleCheck size={22} color={Colors.success} strokeWidth={ICON_STROKE} />
              <AppText variant="bodyMedium">Escolta Pro operations has been alerted.</AppText>
            </View>
            <Notice
              tone={locationShared ? 'info' : 'warning'}
              message={
                locationShared
                  ? 'Your location was shared with the alert.'
                  : 'Your location could not be shared. If you speak with operations or 911, tell them where you are.'
              }
            />
            <AppText variant="footnote">
              This alert does not contact police or medical services. If anyone is in danger, call 911.
            </AppText>
          </View>
        ) : (
          <View style={styles.statusBlock} accessibilityLiveRegion="assertive">
            <View style={styles.status}>
              <CircleAlert size={22} color={Colors.error} strokeWidth={ICON_STROKE} />
              <AppText variant="bodyMedium">{error}</AppText>
            </View>
            <AppText variant="footnote">Call 911 now if you need help. You can also try sending the alert again.</AppText>
          </View>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 2,
    borderColor: Colors.hairline,
    ...Shadow.md,
  },
  triggerText: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: Colors.white,
  },
  options: {
    gap: Space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  statusBlock: {
    gap: Space.md,
  },
  flex: {
    flex: 1,
  },
});
