import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button } from '@/components/ui';
import Colors from '@/constants/colors';
import type { StripePaymentFormProps } from '@/components/funnel/paymentTypes';
import { demoSandbox } from './firebase';

export function DemoPaymentForm({ clientSecret, payLabel, onSucceeded }: StripePaymentFormProps) {
  const { t } = useTranslation('auth');
  const [outcome, setOutcome] = useState<'success' | 'decline'>('success');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pay = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await demoSandbox.pay(clientSecret, outcome);
      onSucceeded({ paymentIntentId: result.paymentIntentId, status: 'succeeded' });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <AppText variant="headline">{t('publicDemo.paymentTitle')}</AppText>
    <AppText variant="footnote">{t('publicDemo.paymentHelp')}</AppText>
    <Button title={t('publicDemo.cardSuccess')} variant={outcome === 'success' ? 'primary' : 'outline'} onPress={() => { setOutcome('success'); setError(''); }} />
    <Button title={t('publicDemo.cardDecline')} variant={outcome === 'decline' ? 'primary' : 'outline'} onPress={() => { setOutcome('decline'); setError(''); }} />
    {error ? <AppText color={Colors.error} accessibilityLiveRegion="polite">{error}</AppText> : null}
    <Button title={payLabel} onPress={pay} loading={busy} />
  </View>;
}
