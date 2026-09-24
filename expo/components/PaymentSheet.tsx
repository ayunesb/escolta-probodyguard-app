import { PUBLIC_DEMO } from '@/constants/demo';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, CreditCard, Lock, Plus, ShieldCheck, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import Colors from '@/constants/colors';
import { ICON_STROKE, MAX_CONTENT_WIDTH, Radius, Shadow, Space } from '@/constants/design';
import { AppText, Button, Card, EmptyState, IconButton, ListGroup, ListRow, SectionTitle, Skeleton } from '@/components/ui';
import { PriceReceipt } from '@/components/funnel/PriceReceipt';
import type { PaymentOutcome } from '@/components/funnel/paymentTypes';
import { paymentService, PaymentApiError, type ServerBreakdown } from '@/services/paymentService';
import { stripeService } from '@/services/stripeService';
import { bookingService } from '@/services/bookingService';
import type { SavedPaymentMethod } from '@/types';
import { formatMXN } from '@/utils/pricing';
import { logger } from '@/utils/logger';
import BraintreeHostedFields, { BraintreeHostedFieldsHandle } from './BraintreeHostedFields';
import StripePaymentForm from './StripePaymentForm';

export type { PaymentOutcome } from '@/components/funnel/paymentTypes';

interface PaymentSheetProps {
  visible: boolean;
  bookingId: string;
  userId: string;
  // Money moved (or is settling). The parent confirms the booking with the server.
  onPaid: (outcome: PaymentOutcome) => void;
  onCancel: () => void;
}

// web + key → Stripe · web without key → explicit notice (react-native-webview
// can't run on web, so there is no Braintree fallback there) · native → Braintree.
type Mode = 'stripe' | 'unconfigured' | 'braintree';

const resolveMode = (): Mode => {
  if (stripeService.isSupportedOnThisPlatform()) return stripeService.isConfigured() ? 'stripe' : 'unconfigured';
  return 'braintree';
};

function quoteErrorMessage(error: unknown): string {
  if (error instanceof PaymentApiError) {
    if (error.status === 409) return i18n.t('funnel:payment.errors.noLongerPending');
    if (error.status === 401) return i18n.t('funnel:payment.errors.sessionExpired');
    if (error.status === 503) return i18n.t('funnel:payment.errors.unavailable');
    return error.message;
  }
  return i18n.t('funnel:payment.errors.unreachable');
}

export default function PaymentSheet({ visible, bookingId, userId, onPaid, onCancel }: PaymentSheetProps) {
  const { t } = useTranslation(['funnel', 'common', 'auth']);
  const insets = useSafeAreaInsets();
  const mode = resolveMode();

  // Canonical amounts from the server (Stripe) or the stored booking (Braintree).
  const [breakdown, setBreakdown] = useState<ServerBreakdown | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(0);

  // Braintree state
  const hostedFieldsRef = useRef<BraintreeHostedFieldsHandle>(null);
  const [savedCards, setSavedCards] = useState<SavedPaymentMethod[]>([]);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showNewCard, setShowNewCard] = useState(false);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const [payError, setPayError] = useState<string | null>(null);

  const setPayingState = (value: boolean) => {
    payingRef.current = value;
    setPaying(value);
  };

  // ---------------------------------------------------------------- quote

  useEffect(() => {
    if (!visible || !bookingId || mode === 'unconfigured') return;
    let cancelled = false;
    setBreakdown(null);
    setQuoteError(null);
    setClientSecret(null);

    (async () => {
      try {
        if (mode === 'stripe') {
          // Server prices the booking canonically and opens/reuses its PaymentIntent.
          const intent = await paymentService.createPaymentIntent(bookingId);
          if (cancelled) return;
          setClientSecret(intent.clientSecret);
          setBreakdown(intent.breakdown);
        } else {
          // Braintree: show the amounts stored on the booking; the server charges
          // the canonical amount and rejects the charge if they don't match.
          const booking = await bookingService.getBookingById(bookingId);
          if (cancelled) return;
          if (!booking || !Number.isFinite(booking.totalAmount)) {
            setQuoteError(i18n.t('funnel:payment.errors.bookingLoad'));
            return;
          }
          if (booking.status !== 'pending') {
            setQuoteError(i18n.t('funnel:payment.errors.noLongerPending'));
            return;
          }
          setBreakdown({
            total: booking.totalAmount,
            processingFee: booking.processingFee,
            subtotal: Math.round((booking.totalAmount - (booking.processingFee ?? 0)) * 100) / 100,
          });
        }
      } catch (error) {
        if (cancelled) return;
        logger.error('[PaymentSheet] Could not prepare payment', error);
        setQuoteError(quoteErrorMessage(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, bookingId, mode, quoteAttempt]);

  // ---------------------------------------------------------------- braintree setup

  const loadClientToken = useCallback(async () => {
    setTokenState('loading');
    try {
      const token = await paymentService.getClientToken(userId);
      setClientToken(token);
      setTokenState('idle');
    } catch (error) {
      logger.error('[PaymentSheet] Client token failed', error);
      setClientToken(null);
      setTokenState('error');
    }
  }, [userId]);

  useEffect(() => {
    if (!visible || mode !== 'braintree') return;
    let cancelled = false;
    setPayError(null);
    setMethodsLoading(true);
    (async () => {
      const cards = await paymentService.getSavedPaymentMethods(userId);
      if (cancelled) return;
      setSavedCards(cards);
      setMethodsLoading(false);
      if (cards.length > 0) {
        setSelectedCard(cards[0].token);
        setShowNewCard(false);
      } else {
        setShowNewCard(true);
        loadClientToken();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, mode, userId, loadClientToken]);

  // Closing the sheet must never leave a spinner behind for next time.
  useEffect(() => {
    if (!visible) {
      setPayingState(false);
      setPayError(null);
    }
  }, [visible]);

  const settleBraintree = async (method: { paymentMethodNonce: string } | { paymentMethodToken: string }) => {
    try {
      const result = await paymentService.processBraintreePayment(bookingId, method);
      if (result.success) {
        setPayingState(false);
        onPaid({ provider: 'braintree', transactionId: result.transactionId, status: 'succeeded' });
        return;
      }
      if (result.requiresAction) {
        setPayError(t('payment.errors.extraVerification'));
        setShowNewCard(true);
        if (!clientToken) loadClientToken();
      } else {
        setPayError(result.error ?? t('payment.errors.declined'));
      }
    } catch (error) {
      logger.error('[PaymentSheet] Braintree payment threw', error);
      setPayError(t('payment.errors.unreachableRetry'));
    }
    setPayingState(false);
  };

  const paySavedCard = () => {
    if (!selectedCard || payingRef.current) return;
    setPayError(null);
    setPayingState(true);
    // Saved cards are charged by vault TOKEN (sending it as a nonce always failed).
    settleBraintree({ paymentMethodToken: selectedCard });
  };

  const payNewCard = () => {
    if (payingRef.current) return;
    if (!hostedFieldsRef.current) {
      setPayError(t('payment.errors.formNotReady'));
      return;
    }
    setPayError(null);
    setPayingState(true);
    hostedFieldsRef.current.submitPayment();
  };

  const onHostedSuccess = (nonce: string) => {
    // A nonce that arrives after a timeout is ignored — it is not a charge.
    if (!payingRef.current) return;
    settleBraintree({ paymentMethodNonce: nonce });
  };

  const onHostedError = (message: string) => {
    setPayError(message);
    setPayingState(false);
  };

  // ---------------------------------------------------------------- render

  const total = breakdown?.total;
  const payLabel = typeof total === 'number' ? t('payment.payAmount', { amount: formatMXN(total) }) : t('payment.pay');
  const returnUrl =
    Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/booking/${bookingId}` : undefined;

  const close = () => {
    if (payingRef.current) return; // never abandon a charge mid-flight
    onCancel();
  };

  const receipt = (
    <Card tone="raised" style={styles.receipt}>
      <View style={styles.receiptHead}>
        <AppText variant="overline">{t('payment.receipt')}</AppText>
        <AppText variant="caption" color={Colors.textTertiary}>
          MXN
        </AppText>
      </View>
      {breakdown ? (
        <PriceReceipt breakdown={breakdown} />
      ) : quoteError ? (
        <View style={styles.quoteError}>
          <AppText variant="callout" color={Colors.error} accessibilityLiveRegion="polite">
            {quoteError}
          </AppText>
          <Button
            title={t('common:actions.tryAgain')}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => setQuoteAttempt((n) => n + 1)}
          />
        </View>
      ) : (
        <View style={styles.skeletonRows} accessibilityLabel={t('payment.loadingAmounts')}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="50%" height={14} />
          <Skeleton width="40%" height={20} style={styles.skeletonTotal} />
        </View>
      )}
    </Card>
  );

  const assurance = (
    <View style={styles.assurance}>
      <ShieldCheck size={15} color={Colors.textTertiary} strokeWidth={ICON_STROKE} />
      <AppText variant="footnote" color={Colors.textTertiary} style={styles.flex}>
        {PUBLIC_DEMO ? t('auth:publicDemo.paymentHelp') : t('payment.assurance')}
      </AppText>
    </View>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (mode === 'unconfigured') {
    body = (
      <EmptyState
        icon={CreditCard}
        title={t('payment.unconfiguredTitle')}
        message={t('payment.unconfiguredMessage')}
        actionLabel={t('common:actions.close')}
        onAction={onCancel}
      />
    );
  } else if (mode === 'stripe') {
    body = (
      <>
        {receipt}
        {assurance}
        <SectionTitle title={t('payment.method')} />
        {clientSecret ? (
          <StripePaymentForm
            clientSecret={clientSecret}
            payLabel={payLabel}
            returnUrl={returnUrl}
            onSucceeded={({ paymentIntentId, status }) =>
              onPaid({ provider: 'stripe', transactionId: paymentIntentId, status })
            }
          />
        ) : quoteError ? null : (
          <Skeleton height={140} radius={Radius.md} />
        )}
      </>
    );
  } else {
    body = (
      <>
        {receipt}
        {assurance}
        <SectionTitle title={t('payment.method')} />
        {methodsLoading ? (
          <Skeleton height={64} radius={Radius.lg} />
        ) : !showNewCard && savedCards.length > 0 ? (
          <ListGroup>
            {[
              ...savedCards.map((card) => (
                <ListRow
                  key={card.token}
                  icon={CreditCard}
                  title={`${card.cardType} •••• ${card.last4}`}
                  subtitle={t('payment.expires', { month: card.expirationMonth, year: card.expirationYear })}
                  onPress={() => setSelectedCard(card.token)}
                  showChevron={false}
                  trailing={
                    selectedCard === card.token ? (
                      <Check size={18} color={Colors.accent} strokeWidth={2} />
                    ) : null
                  }
                />
              )),
              <ListRow
                key="new"
                icon={Plus}
                title={t('payment.newCard')}
                onPress={() => {
                  setShowNewCard(true);
                  setPayError(null);
                  if (!clientToken) loadClientToken();
                }}
              />,
            ]}
          </ListGroup>
        ) : tokenState === 'loading' ? (
          <Skeleton height={200} radius={Radius.lg} />
        ) : tokenState === 'error' || !clientToken ? (
          <View style={styles.quoteError}>
            <AppText variant="callout" color={Colors.error}>
              {t('payment.errors.formLoad')}
            </AppText>
            <Button title={t('common:actions.tryAgain')} variant="secondary" size="sm" fullWidth={false} onPress={loadClientToken} />
          </View>
        ) : (
          <>
            <BraintreeHostedFields
              ref={hostedFieldsRef}
              clientToken={clientToken}
              onSuccess={onHostedSuccess}
              onError={onHostedError}
            />
            {savedCards.length > 0 ? (
              <Button
                title={t('payment.savedCard')}
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={() => {
                  setShowNewCard(false);
                  setPayError(null);
                }}
                disabled={paying}
              />
            ) : null}
          </>
        )}

        {payError ? (
          <AppText variant="callout" color={Colors.error} style={styles.payError} accessibilityLiveRegion="polite">
            {payError}
          </AppText>
        ) : null}
      </>
    );

    const canPay = !!breakdown && !quoteError && (showNewCard ? !!clientToken : !!selectedCard);
    footer = (
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}>
        <Button
          title={payLabel}
          icon={Lock}
          size="lg"
          onPress={showNewCard ? payNewCard : paySavedCard}
          loading={paying}
          disabled={!canPay}
          accessibilityHint={t('payment.payHint')}
        />
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('payment.close')}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.flex}>
              <AppText variant="overline" color={Colors.accent}>
                {t('payment.secureCheckout')}
              </AppText>
              <AppText variant="title2" accessibilityRole="header" style={styles.title}>
                {t('payment.title')}
              </AppText>
            </View>
            <IconButton icon={X} onPress={close} disabled={paying} accessibilityLabel={t('payment.close')} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, footer ? null : { paddingBottom: Math.max(insets.bottom, Space.xxl) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>

          {footer}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH + Space.gutter * 2,
    alignSelf: 'center',
    maxHeight: '92%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.borderStrong,
    ...Shadow.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    marginTop: Space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.lg,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.lg,
    paddingBottom: Space.md,
  },
  title: {
    marginTop: Space.xs,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.xl,
  },
  receipt: {
    marginTop: Space.sm,
  },
  receiptHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  skeletonRows: {
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  skeletonTotal: {
    alignSelf: 'flex-end',
    marginTop: Space.xs,
  },
  quoteError: {
    gap: Space.md,
    alignItems: 'flex-start',
    paddingVertical: Space.sm,
  },
  assurance: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'flex-start',
    marginTop: Space.md,
  },
  payError: {
    marginTop: Space.md,
  },
  footer: {
    paddingTop: Space.md,
    paddingHorizontal: Space.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
