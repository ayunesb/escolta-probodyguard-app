/**
 * Payment Service Unit Tests
 * Client token, server-confirmed payments (Stripe + Braintree), saved cards, refunds.
 * Pricing itself lives in utils/pricing (calculatePrice) and is not duplicated here.
 */

import { paymentService } from '@/services/paymentService';
import { formatMXN } from '@/utils/pricing';
import { getDocs, updateDoc } from 'firebase/firestore';

// Mock ENV config
jest.mock('@/config/env', () => ({
  ENV: {
    API_URL: 'https://api.test.com',
    PAYMENTS_CURRENCY: 'MXN',
  },
  PAYMENT_CONFIG: {
    PROCESSING_FEE_PERCENT: 0.029,
    PROCESSING_FEE_FIXED: 3.5,
    PLATFORM_CUT_PERCENT: 0.1,
  },
}));

// Mock Firebase
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(() => ({ seconds: Date.now() / 1000 })),
}));

jest.mock('@/lib/firebase', () => ({
  db: jest.fn(() => ({})),
  auth: jest.fn(() => ({
    currentUser: { getIdToken: jest.fn().mockResolvedValue('id-token-abc') },
  })),
}));

// Mock fetch
global.fetch = jest.fn();

describe('PaymentService - Client Token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get client token successfully', async () => {
    const mockToken = 'mock-braintree-client-token-12345';
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ clientToken: mockToken }),
    });

    const token = await paymentService.getClientToken('user-123');

    expect(token).toBe(mockToken);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should handle client token generation error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(paymentService.getClientToken('user-123')).rejects.toThrow();
  });
});

describe('PaymentService - Braintree charge (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const lastBody = () => JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);

  it('charges a new card by nonce and sends only bookingId + nonce', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, transactionId: 'transaction-123' }),
    });

    const result = await paymentService.processBraintreePayment('booking-789', {
      paymentMethodNonce: 'payment-nonce-xyz',
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('transaction-123');
    expect(lastBody()).toEqual({ bookingId: 'booking-789', paymentMethodNonce: 'payment-nonce-xyz' });
    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer id-token-abc');
  });

  it('charges a saved card by vault token, not as a nonce', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, transactionId: 'transaction-456' }),
    });

    await paymentService.processBraintreePayment('booking-789', { paymentMethodToken: 'pm-1' });

    expect(lastBody()).toEqual({ bookingId: 'booking-789', paymentMethodToken: 'pm-1' });
  });

  it('never flips a successful charge because of client bookkeeping', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, transactionId: 'transaction-789' }),
    });
    (updateDoc as jest.Mock).mockRejectedValue(new Error('permission-denied'));

    const result = await paymentService.processBraintreePayment('booking-789', { paymentMethodNonce: 'n' });

    expect(result.success).toBe(true);
  });

  it('reports a declined charge', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Insufficient funds' }),
    });

    const result = await paymentService.processBraintreePayment('booking-789', { paymentMethodNonce: 'n' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Insufficient funds');
  });
});

describe('PaymentService - Stripe (web)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a payment intent and returns the server breakdown', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        clientSecret: 'pi_1_secret_2',
        paymentIntentId: 'pi_1',
        breakdown: { subtotal: 1000, processingFee: 39, total: 1039, totalCents: 103900 },
      }),
    });

    const intent = await paymentService.createPaymentIntent('booking-789');

    expect(intent.clientSecret).toBe('pi_1_secret_2');
    expect(intent.breakdown.total).toBe(1039);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/api\/stripe\/payment-intent$/);
    expect(JSON.parse(init.body)).toEqual({ bookingId: 'booking-789' });
    expect(init.headers.Authorization).toBe('Bearer id-token-abc');
  });

  it('surfaces the HTTP status when the booking is no longer pending', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Booking is not pending' }),
    });

    await expect(paymentService.createPaymentIntent('booking-789')).rejects.toMatchObject({ status: 409 });
  });

  it('confirms the booking server-side', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'processing' }),
    });

    const result = await paymentService.confirmBookingPayment('booking-789');

    expect(result.status).toBe('processing');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toMatch(/\/api\/stripe\/confirm-booking$/);
  });
});

describe('PaymentService - Payment Methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load saved payment methods', async () => {
    const mockPaymentMethods = [
      {
        token: 'pm-1',
        last4: '4242',
        cardType: 'Visa',
        expirationMonth: '12',
        expirationYear: '2025',
      },
      {
        token: 'pm-2',
        last4: '5555',
        cardType: 'MasterCard',
        expirationMonth: '06',
        expirationYear: '2026',
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ paymentMethods: mockPaymentMethods }),
    });

    const methods = await paymentService.getSavedPaymentMethods('user-123');

    expect(methods).toHaveLength(2);
    expect(methods[0].token).toBe('pm-1');
    expect(methods[0].last4).toBe('4242');
    expect(methods[1].cardType).toBe('MasterCard');
  });

  it('should handle no saved payment methods (404)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ paymentMethods: [] }),
    });

    const methods = await paymentService.getSavedPaymentMethods('user-123');

    expect(methods).toEqual([]);
  });

  it('should remove payment method successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await expect(
      paymentService.removePaymentMethod('user-123', 'pm-token')
    ).resolves.not.toThrow();

    expect(global.fetch).toHaveBeenCalled();
  });
});

describe('PaymentService - Refunds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Firestore query for refund updates
    (getDocs as jest.Mock).mockResolvedValue({
      empty: false,
      docs: [{
        id: 'payment-doc-123',
      }],
    });
  });

  it('should process refund successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ 
        success: true,
        refundId: 'refund-123' 
      }),
    });

    const result = await paymentService.processRefund(
      'transaction-123',
      'booking-789',
      150.00
    );

    expect(result.success).toBe(true);
    // The service returns refundId as transactionId
    expect(result.transactionId).toBe('refund-123');
  });

  it('should handle partial refunds', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ 
        success: true,
        refundId: 'refund-456' 
      }),
    });

    const result = await paymentService.processRefund(
      'transaction-123',
      'booking-789',
      75.00
    );

    expect(result.success).toBe(true);
    // The service returns refundId as transactionId
    expect(result.transactionId).toBe('refund-456');
  });

  it('should handle refund processing error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Transaction already refunded' }),
    });

    const result = await paymentService.processRefund(
      'transaction-123',
      'booking-789',
      150.00
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('PaymentService - Formatting', () => {
  it('formats MXN currency via utils/pricing', () => {
    const formatted = formatMXN(1234.56);
    expect(formatted).toContain('1,234.56');
    expect(formatted).toMatch(/\$|MXN/);
  });
});
