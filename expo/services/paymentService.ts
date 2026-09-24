/**
 * Payments on the client.
 *
 * Pricing is NOT computed here: the only formula is `utils/pricing`
 * (`calculatePrice`), and the server recomputes it from the stored booking
 * before charging. The client never sends an amount and never writes
 * `status: 'confirmed'` — the server confirms the booking once the processor
 * says the charge succeeded (CONTRACT §4).
 *
 * - Web: Stripe (Vercel functions in `api/stripe/*`).
 * - Native: Braintree via Cloud Functions (`/payments/*`), same server rules.
 */
import { collection, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { auth as getAuthInstance, db as getDbInstance } from '@/lib/firebase';
import type { SavedPaymentMethod } from '@/types';
import type { PriceBreakdown } from '@/utils/pricing';
import { PUBLIC_DEMO } from '@/constants/demo';
import { ENV } from '@/config/env';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  requiresAction?: boolean;
  actionUrl?: string;
}

/**
 * Canonical amounts as returned by the server. `total` is always present;
 * the itemised fields are shown when the server sends them.
 */
export type ServerBreakdown = Pick<PriceBreakdown, 'total'> &
  Partial<Omit<PriceBreakdown, 'total'>>;

export interface PaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  breakdown: ServerBreakdown;
}

export type BookingPaymentStatus = 'confirmed' | 'processing';

/** A saved Braintree card is charged by its vault token, a new card by a one-time nonce. */
export type BraintreeMethod = { paymentMethodNonce: string } | { paymentMethodToken: string };

/** HTTP error from the payments API; `status` lets screens react to 409 etc. */
export class PaymentApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PaymentApiError';
    this.status = status;
  }
}

// Same origin on web (Vercel serves /api next to the app). Read with a static
// `process.env.EXPO_PUBLIC_*` access so Expo inlines it at build time.
const apiBase = (): string => process.env.EXPO_PUBLIC_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const user = getAuthInstance().currentUser;
  if (!user) throw new PaymentApiError(i18n.t('funnel:payment.errors.signInAgain'), 401);
  const idToken = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const raw = body?.error ?? body?.message;
    if (typeof raw === 'string' && raw.trim()) return raw;
    if (raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string') {
      return (raw as { message: string }).message;
    }
  } catch {
    // Body wasn't JSON; fall through.
  }
  return fallback;
}

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function normalizeBreakdown(raw: unknown, fallbackTotal?: unknown): ServerBreakdown | null {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const total = toNumber(source.total) ?? toNumber(fallbackTotal);
  if (total === undefined) return null;
  return {
    total,
    subtotal: toNumber(source.subtotal),
    baseSubtotal: toNumber(source.baseSubtotal),
    armoredSurcharge: toNumber(source.armoredSurcharge),
    armedSurcharge: toNumber(source.armedSurcharge),
    processingFee: toNumber(source.processingFee),
    platformCut: toNumber(source.platformCut),
    guardPayout: toNumber(source.guardPayout),
    totalCents: toNumber(source.totalCents),
  };
}

export const paymentService = {
  // ---------------------------------------------------------------- Stripe (web)

  /**
   * Asks the server to price the booking canonically and open (or reuse) its
   * PaymentIntent. Returns the client secret plus the breakdown to display.
   */
  async createPaymentIntent(bookingId: string): Promise<PaymentIntentResponse> {
    if (PUBLIC_DEMO) return (await import('@/demo/firebase')).demoSandbox.createPayment(bookingId);
    const response = await fetch(`${apiBase()}/api/stripe/payment-intent`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ bookingId }),
    });

    if (!response.ok) {
      const message = await readError(response, i18n.t('funnel:payment.errors.startFailed'));
      logger.error('[Payment] payment-intent rejected', { status: response.status, message });
      throw new PaymentApiError(message, response.status);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const clientSecret = typeof data.clientSecret === 'string' ? data.clientSecret : '';
    const breakdown = normalizeBreakdown(data.breakdown, data.amount);
    if (!clientSecret || !breakdown) {
      throw new PaymentApiError(i18n.t('funnel:payment.errors.incompleteResponse'), 502);
    }
    return {
      clientSecret,
      paymentIntentId: typeof data.paymentIntentId === 'string' ? data.paymentIntentId : '',
      breakdown,
    };
  },

  /**
   * After Stripe reports success (or processing), the server verifies the
   * PaymentIntent and marks the booking confirmed. Idempotent: safe to retry.
   */
  async confirmBookingPayment(bookingId: string): Promise<{ status: BookingPaymentStatus }> {
    if (PUBLIC_DEMO) return (await import('@/demo/firebase')).demoSandbox.confirmPayment(bookingId) as Promise<{ status: BookingPaymentStatus }>;
    const response = await fetch(`${apiBase()}/api/stripe/confirm-booking`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ bookingId }),
    });

    if (!response.ok) {
      const message = await readError(response, i18n.t('funnel:payment.errors.confirmFailed'));
      logger.error('[Payment] confirm-booking rejected', { status: response.status, message });
      throw new PaymentApiError(message, response.status);
    }

    const data = (await response.json()) as { status?: unknown };
    return { status: data.status === 'confirmed' ? 'confirmed' : 'processing' };
  },

  // ------------------------------------------------------------ Braintree (native)

  async getClientToken(userId: string): Promise<string> {
    const url = new URL(`${ENV.API_URL}/payments/client-token`);
    if (userId) url.searchParams.set('userId', userId);
    const response = await fetch(url.toString(), { method: 'GET' });
    if (!response.ok) {
      logger.error('[Payment] client-token failed', { status: response.status });
      throw new Error('Failed to get client token');
    }
    const data = await response.json();
    return data.clientToken;
  },

  /**
   * Charges the booking through Braintree. The server loads the booking,
   * charges the canonical amount and confirms it — so the body carries only
   * the booking id and the payment method, never an amount.
   *
   * The result reflects the CHARGE only. Nothing after a successful charge
   * (bookkeeping, analytics) may turn it into a failure, or the client would
   * see "Payment failed" after being charged and pay twice.
   */
  async processBraintreePayment(bookingId: string, method: BraintreeMethod): Promise<PaymentResult> {
    let response: Response;
    try {
      response = await fetch(`${ENV.API_URL}/payments/process`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ bookingId, ...method }),
      });
    } catch (error) {
      logger.error('[Payment] Braintree request failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : i18n.t('funnel:payment.errors.network'),
      };
    }

    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON body; judge by the HTTP status alone.
    }

    if (!response.ok || data.success === false) {
      const raw = data.error;
      const message =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string'
            ? (raw as { message: string }).message
            : i18n.t('funnel:payment.errors.processingFailed');
      logger.error('[Payment] Braintree charge declined', { status: response.status, message });
      return { success: false, error: message };
    }

    if (data.requiresAction) {
      return {
        success: false,
        requiresAction: true,
        actionUrl: typeof data.actionUrl === 'string' ? data.actionUrl : undefined,
      };
    }

    return {
      success: true,
      transactionId: typeof data.transactionId === 'string' ? data.transactionId : undefined,
    };
  },

  async getSavedPaymentMethods(userId: string): Promise<SavedPaymentMethod[]> {
    if (PUBLIC_DEMO) return [];
    try {
      const response = await fetch(`${ENV.API_URL}/payments/methods/${userId}`);
      // 404 = no Braintree customer yet (first-time payer).
      if (response.status === 404) return [];
      if (!response.ok) throw new Error('Failed to fetch payment methods');
      const data = await response.json();
      return data.paymentMethods || [];
    } catch (error) {
      logger.error('[Payment] Error loading saved cards:', error);
      return [];
    }
  },

  async removePaymentMethod(userId: string, token: string): Promise<void> {
    if (PUBLIC_DEMO) return;
    const response = await fetch(`${ENV.API_URL}/payments/methods/${userId}/${token}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      logger.error('[Payment] Error removing payment method', { status: response.status });
      throw new Error('Failed to remove payment method');
    }
  },

  async processRefund(transactionId: string, bookingId: string, amount?: number): Promise<PaymentResult> {
    if (PUBLIC_DEMO) return (await import('@/demo/firebase')).demoSandbox.refund(transactionId, bookingId);
    let data: Record<string, any>;
    try {
      const response = await fetch(`${ENV.API_URL}/payments/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, bookingId, amount }),
      });
      data = await response.json();
      if (!response.ok) {
        logger.error('[Payment] Refund failed:', data.error);
        return { success: false, error: data.error || 'Refund processing failed' };
      }
    } catch (error) {
      logger.error('[Payment] Refund processing error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Refund failed' };
    }

    // Bookkeeping is best-effort: the refund already happened and must be
    // reported as such even if this record can't be updated.
    try {
      const paymentQuery = query(
        collection(getDbInstance(), 'payments'),
        where('transactionId', '==', transactionId)
      );
      const paymentSnapshot = await getDocs(paymentQuery);
      if (!paymentSnapshot.empty) {
        await updateDoc(doc(getDbInstance(), 'payments', paymentSnapshot.docs[0].id), {
          status: 'refunded',
          refundId: data.refundId,
          refundedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      logger.error('[Payment] Refund succeeded but the payment record was not updated', error);
    }

    return { success: true, transactionId: data.refundId };
  },
};

export default paymentService;
