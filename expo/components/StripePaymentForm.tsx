/**
 * Native fallback for the Stripe form.
 *
 * Stripe on iOS/Android needs @stripe/stripe-react-native (a native build with
 * Apple Pay / Google Pay setup). Until then PaymentSheet uses the Braintree
 * path on native and never renders this; it exists so both platform files
 * share one props contract (TypeScript type-checks against this file).
 */
import { StyleSheet, View } from 'react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText } from '@/components/ui';
import type { StripePaymentFormProps } from '@/components/funnel/paymentTypes';

export type { StripePaymentFormProps } from '@/components/funnel/paymentTypes';

export default function StripePaymentForm(_props: StripePaymentFormProps) {
  return (
    <View style={styles.container}>
      <AppText variant="callout" align="center" color={Colors.textSecondary}>
        Card payments with Stripe are available in the web app.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.xl,
    alignItems: 'center',
  },
});
