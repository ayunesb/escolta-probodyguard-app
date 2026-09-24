/**
 * Stripe Payment Element (web).
 *
 * Uses Stripe.js directly (no @stripe/react-stripe-js) to avoid another React
 * peer dependency. Card data never touches this code or our server: the
 * Payment Element sends it straight to Stripe from Stripe's own iframe.
 *
 * The PaymentIntent (and therefore the amount) is created by the parent via
 * paymentService.createPaymentIntent; this component only mounts the element
 * and confirms. Every exit path of `pay` resolves the loading state.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { Lock } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import { AppText, Button, Skeleton } from '@/components/ui';
import { stripeService } from '@/services/stripeService';
import { logger } from '@/utils/logger';
import type { StripePaymentFormProps } from '@/components/funnel/paymentTypes';

export type { StripePaymentFormProps } from '@/components/funnel/paymentTypes';

export default function StripePaymentForm({ clientSecret, payLabel, returnUrl, onSucceeded, onError }: StripePaymentFormProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let element: StripePaymentElement | null = null;
    setReady(false);
    setSetupError(null);

    (async () => {
      try {
        if (!stripeService.isConfigured()) throw new Error('Payments are not configured.');
        const stripe = await stripeService.load();
        if (cancelled) return;
        if (!stripe) throw new Error('Stripe could not be loaded.');
        stripeRef.current = stripe;

        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: Colors.accent,
              colorBackground: Colors.surfaceLight,
              colorText: Colors.textPrimary,
              colorTextSecondary: Colors.textSecondary,
              colorDanger: Colors.error,
              borderRadius: `${Radius.md}px`,
              fontFamily: 'Geist, system-ui, -apple-system, sans-serif',
            },
          },
        });
        elementsRef.current = elements;
        element = elements.create('payment', { layout: 'tabs' });
        element.on('ready', () => {
          if (!cancelled) setReady(true);
        });
        element.on('loaderror', () => {
          if (cancelled) return;
          setSetupError('The secure card form could not load.');
        });
        if (mountRef.current) element.mount(mountRef.current);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'The secure card form could not load.';
        logger.error('[Stripe] Payment Element setup failed', { message });
        setSetupError(message);
        onError?.(message);
      }
    })();

    return () => {
      cancelled = true;
      try {
        element?.destroy();
      } catch {
        // already torn down
      }
      elementsRef.current = null;
    };
    // onError is a callback prop; re-mounting the element on every render would reset the card form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, attempt]);

  const pay = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
      });

      if (error) {
        const message = error.message ?? 'The payment could not be completed.';
        setPayError(message);
        onError?.(message);
        return;
      }
      const status = paymentIntent?.status;
      if (status === 'succeeded') {
        onSucceeded({ paymentIntentId: paymentIntent!.id, status: 'succeeded' });
        return;
      }
      // Vouchers and bank transfers (OXXO, SPEI) settle later: not an error.
      if (status === 'processing' || status === 'requires_action' || status === 'requires_capture') {
        onSucceeded({ paymentIntentId: paymentIntent!.id, status: 'processing' });
        return;
      }
      const message = 'The payment was not completed. Please try another method.';
      setPayError(message);
      onError?.(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error. You were not charged.';
      logger.error('[Stripe] confirmPayment threw', { message });
      setPayError(message);
      onError?.(message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.container}>
      {setupError ? (
        <View style={styles.notice}>
          <AppText variant="callout" color={Colors.error} align="center">
            {setupError}
          </AppText>
          <Button title="Try again" variant="secondary" size="sm" fullWidth={false} onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : !ready ? (
        <View style={styles.skeleton} accessibilityLabel="Loading secure card form">
          <Skeleton height={48} radius={Radius.md} />
          <View style={styles.skeletonRow}>
            <Skeleton height={48} radius={Radius.md} style={styles.flex} />
            <Skeleton height={48} radius={Radius.md} style={styles.flex} />
          </View>
        </View>
      ) : null}

      {/* Always mounted so a retry can re-attach the element to the same node. */}
      <div ref={mountRef} style={{ minHeight: ready && !setupError ? 200 : 0, display: setupError ? 'none' : 'block' }} />

      {payError ? (
        <AppText variant="callout" color={Colors.error} style={styles.error} accessibilityLiveRegion="polite">
          {payError}
        </AppText>
      ) : null}

      {setupError ? null : (
        <Button
          title={payLabel}
          icon={Lock}
          size="lg"
          onPress={pay}
          loading={paying}
          disabled={!ready}
          style={styles.pay}
          accessibilityHint="Charges your card and confirms the booking"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  skeleton: {
    gap: Space.md,
    marginBottom: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  error: {
    marginTop: Space.md,
  },
  pay: {
    marginTop: Space.xl,
  },
  notice: {
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xl,
  },
});
