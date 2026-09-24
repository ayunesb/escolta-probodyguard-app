/**
 * POST /api/stripe/webhook  (lo llama Stripe, no la app)
 *
 * Verifica la firma con STRIPE_WEBHOOK_SECRET sobre el cuerpo CRUDO (por eso
 * bodyParser esta desactivado) y, con payment_intent.succeeded, corre la
 * misma confirmacion que /confirm-booking. Asi una reserva pagada con
 * OXXO/SPEI (que se acredita horas despues) o cuyo cliente cerro la app antes
 * de confirmar queda confirmada igual.
 *
 * Responde 2xx a todo lo que no se debe reintentar (eventos ajenos, reservas
 * que no coinciden: quedan en payment_anomalies) y 500 solo ante errores
 * transitorios, para que Stripe reintente.
 */
import type Stripe from 'stripe';
import { ApiError, confirmBookingPayment, readRawBody, stripeClient, type ApiRequest, type ApiResponse } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    return;
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY not set');
    res.status(503).json({ error: { code: 'PAYMENTS_NOT_CONFIGURED', message: 'Webhook not configured' } });
    return;
  }

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new Error('missing stripe-signature header');
    event = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    console.error('[Stripe webhook] Invalid signature:', error instanceof Error ? error.message : error);
    res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      if (!bookingId) {
        res.status(200).json({ received: true, ignored: 'no bookingId metadata' });
        return;
      }
      const result = await confirmBookingPayment(bookingId, { paymentIntent: pi });
      res.status(200).json({ received: true, ...result });
      return;
    }
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      console.warn('[Stripe webhook] Payment failed', pi.metadata?.bookingId, pi.last_payment_error?.code);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      // No se arregla reintentando (reserva inexistente, ya no pendiente,
      // pago que no coincide: registrado en payment_anomalies).
      console.warn('[Stripe webhook]', event.type, error.code, error.message);
      res.status(200).json({ received: true, error: error.code });
      return;
    }
    console.error('[Stripe webhook] Processing error:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Temporary error; Stripe will retry' } });
  }
}
