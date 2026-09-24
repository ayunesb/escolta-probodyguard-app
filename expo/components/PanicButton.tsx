import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { PUBLIC_DEMO } from '@/constants/demo';
import { openContact } from '@/utils/openContact';
import { useTranslation } from 'react-i18next';
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

// Los textos de cada opcion viven en booking:panic.options.<type>.
const OPTIONS: { type: EmergencyType; icon: LucideIcon }[] = [
  { type: 'panic', icon: Siren },
  { type: 'sos', icon: LifeBuoy },
  { type: 'medical', icon: HeartPulse },
  { type: 'security', icon: ShieldAlert },
];

type Phase = 'choose' | 'sending' | 'sent' | 'failed';

async function call911() {
  try {
    await openContact('tel:911');
  } catch (error) {
    logger.error('[PanicButton] Could not open the dialer', error);
  }
}

export default function PanicButton({ userId, bookingId, size = 'medium', onAlertTriggered }: PanicButtonProps) {
  const { t } = useTranslation(['booking', 'common', 'auth']);
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
      setError(result.error ?? t('booking:panic.sendFailed'));
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
        accessibilityLabel={t('booking:panic.triggerA11y')}
        accessibilityHint={t('booking:panic.triggerHint')}
        style={[styles.trigger, { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 }]}
      >
        <TriangleAlert size={iconSize} color={Colors.white} strokeWidth={2.25} />
        <AppText style={styles.triggerText}>{t('booking:panic.trigger')}</AppText>
      </PressableScale>

      <Sheet
        visible={visible}
        onClose={close}
        dismissable={phase !== 'sending'}
        eyebrow={t('booking:panic.eyebrow')}
        title={t(
          phase === 'sent'
            ? 'booking:panic.titleSent'
            : phase === 'failed'
              ? 'booking:panic.titleFailed'
              : 'booking:panic.titleChoose'
        )}
        testID="panic-sheet"
        footer={
          phase === 'sent' ? (
            <Button title={t('common:actions.done')} variant="secondary" onPress={close} style={styles.flex} />
          ) : phase === 'failed' ? (
            <>
              <Button title={t('common:actions.cancel')} variant="secondary" onPress={close} style={styles.flex} />
              <Button
                title={t('common:actions.tryAgain')}
                variant="outline"
                onPress={() => send(lastType)}
                style={styles.flex}
              />
            </>
          ) : phase === 'choose' ? (
            <Button
              title={t('common:actions.cancel')}
              variant="secondary"
              onPress={close}
              accessibilityLabel={t('booking:panic.cancelA11y')}
              style={styles.flex}
            />
          ) : null
        }
      >
        <Button
          title={t('booking:panic.call911')}
          icon={PhoneCall}
          variant="danger"
          size="lg"
          onPress={call911}
          accessibilityLabel={t('booking:panic.call911A11y')}
          accessibilityHint={t('booking:panic.call911Hint')}
        />

        {phase === 'choose' ? (
          <>
            <AppText variant="callout">{t('booking:panic.intro')}</AppText>
            <View style={styles.options}>
              {OPTIONS.map((opt) => (
                <PressableScale
                  key={opt.type}
                  onPress={() => send(opt.type)}
                  scaleTo={0.98}
                  haptic="medium"
                  accessibilityRole="button"
                  accessibilityLabel={t(`booking:panic.options.${opt.type}.a11y`)}
                  accessibilityHint={t(`booking:panic.options.${opt.type}.hint`)}
                  hoverStyle={{ borderColor: Colors.borderStrong }}
                  style={styles.option}
                >
                  <View style={styles.optionIcon}>
                    <opt.icon size={20} color={Colors.error} strokeWidth={ICON_STROKE} />
                  </View>
                  <View style={styles.optionText}>
                    <AppText variant="headline">{t(`booking:panic.options.${opt.type}.title`)}</AppText>
                    <AppText variant="footnote">{t(`booking:panic.options.${opt.type}.subtitle`)}</AppText>
                  </View>
                </PressableScale>
              ))}
            </View>
          </>
        ) : phase === 'sending' ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={Colors.accent} />
            <AppText variant="bodyMedium" style={styles.flex}>
              {t('booking:panic.sending')}
            </AppText>
          </View>
        ) : phase === 'sent' ? (
          <View style={styles.statusBlock} accessibilityLiveRegion="polite">
            <View style={styles.status}>
              <CircleCheck size={22} color={Colors.success} strokeWidth={ICON_STROKE} />
              <AppText variant="bodyMedium" style={styles.flex}>
                {t('booking:panic.sent')}
              </AppText>
            </View>
            <Notice
              tone={locationShared ? 'info' : 'warning'}
              message={
                locationShared ? t('booking:panic.locationShared') : t('booking:panic.locationNotShared')
              }
            />
            <AppText variant="footnote">{PUBLIC_DEMO ? t('auth:publicDemo.alertSent') : t('booking:panic.notEmergencyServices')}</AppText>
          </View>
        ) : (
          <View style={styles.statusBlock} accessibilityLiveRegion="assertive">
            <View style={styles.status}>
              <CircleAlert size={22} color={Colors.error} strokeWidth={ICON_STROKE} />
              <AppText variant="bodyMedium" style={styles.flex}>
                {error}
              </AppText>
            </View>
            <AppText variant="footnote">{t('booking:panic.failedHelp')}</AppText>
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
