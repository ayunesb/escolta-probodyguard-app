/**
 * Stripe on the client: configuration checks and the Stripe.js loader.
 *
 * Only the PUBLISHABLE key lives here (it is designed to ship in the browser).
 * Creating the PaymentIntent and confirming the booking go through
 * `paymentService` (api/stripe/*), which holds the secret key and recomputes
 * the amount from the stored booking — the client never sends an amount.
 */
import { Platform } from 'react-native';
import { PUBLIC_DEMO } from '@/constants/demo';
import type { Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export const stripeService = {
  /** True when a publishable key is present. The API is same-origin on web. */
  isConfigured(): boolean {
    return PUBLIC_DEMO || Boolean(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  },

  publishableKey(): string {
    return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
  },

  /**
   * The Payment Element is web-only. Native needs @stripe/stripe-react-native
   * (a native build); until then native payments use the Braintree path.
   */
  isSupportedOnThisPlatform(): boolean {
    return Platform.OS === 'web';
  },

  /** Loads Stripe.js once per session. */
  load(): Promise<Stripe | null> {
    if (PUBLIC_DEMO) return Promise.resolve(null);
    if (!stripePromise) {
      stripePromise = import('@stripe/stripe-js')
        .then(({ loadStripe }) => loadStripe(stripeService.publishableKey()))
        .catch((error) => {
          // Allow a retry on the next attempt instead of caching the failure.
          stripePromise = null;
          throw error;
        });
    }
    return stripePromise;
  },
};

export default stripeService;
