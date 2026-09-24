// Shared contracts between PaymentSheet and the platform payment forms.
// StripePaymentForm.tsx (native stub) and StripePaymentForm.web.tsx must
// accept exactly these props: TypeScript resolves the non-.web file when
// type-checking, so a drift would hide errors in the web build.

export interface StripePaymentFormProps {
  // From paymentService.createPaymentIntent (the server priced the booking).
  clientSecret: string;
  // e.g. "Pay $4,532.00"
  payLabel: string;
  // Where Stripe sends the browser back if a method needs a redirect.
  returnUrl?: string;
  onSucceeded: (result: { paymentIntentId: string; status: 'succeeded' | 'processing' }) => void;
  onError?: (message: string) => void;
}

// What the sheet reports once money has moved (or is moving).
export interface PaymentOutcome {
  provider: 'stripe' | 'braintree';
  transactionId?: string;
  // 'processing' = voucher / bank transfer still settling.
  status: 'succeeded' | 'processing';
}
