const { handleCreatePaymentMethod } = require('../lib/index');
const httpMocks = require('node-mocks-http');

// Mock gateway.paymentMethod.create via jest spy on module import
jest.mock('braintree', () => {
  const original = jest.requireActual('braintree');
  return {
    ...original,
    BraintreeGateway: function () {
      return {
        paymentMethod: {
          create: jest.fn(async (params) => ({ success: true, paymentMethod: { token: 'unit-test-token', type: 'CreditCard' } })),
        },
      };
    },
  };
});

describe('handleCreatePaymentMethod', () => {
  it('returns success and token when gateway.create succeeds', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/payments/methods/test-user',
      params: { userId: 'test-user' },
      body: { payment_method_nonce: 'fake-nonce' },
    });
    // requireAuth deja aqui el uid del ID token verificado
    (req as any).uid = 'test-user';
    const res = httpMocks.createResponse();

    await handleCreatePaymentMethod(req, res);

    const data = res._getJSONData();
    // handler returns 201 on success
    expect(res.statusCode).toBe(201);
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token', 'unit-test-token');
  });

  it('rejects adding a payment method to another user', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/payments/methods/victim',
      params: { userId: 'victim' },
      body: { payment_method_nonce: 'fake-nonce' },
    });
    (req as any).uid = 'attacker';
    const res = httpMocks.createResponse();

    await handleCreatePaymentMethod(req, res);

    expect(res.statusCode).toBe(403);
  });
});
