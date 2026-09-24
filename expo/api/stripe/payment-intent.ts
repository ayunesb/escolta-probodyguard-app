/**
 * POST /api/stripe/payment-intent
 * Header: Authorization: Bearer <Firebase ID token>
 * Body:   {"bookingId": "<id>"}
 *
 * Recalcula el precio en el servidor (tarifa ACTUAL del escolta + opciones de
 * la reserva), escribe los importes canonicos en la reserva y crea (o
 * reutiliza) el PaymentIntent por ese importe exacto en MXN.
 *
 * 200 {clientSecret, paymentIntentId, breakdown}
 * 400 INVALID_ARGUMENT | 401 UNAUTHENTICATED | 403 FORBIDDEN | 404 NOT_FOUND
 * 409 BOOKING_NOT_PENDING | BOOKING_CHANGED | BOOKING_ALREADY_PAID | GUARD_UNAVAILABLE | GUARD_NOT_VERIFIED
 * 422 INVALID_BOOKING | 503 SERVER_NOT_CONFIGURED | PAYMENTS_NOT_CONFIGURED
 *
 * Variables de entorno: ver _lib.ts.
 */
import {
  applyCors,
  bookingIdFrom,
  createPaymentIntentForBooking,
  requireUser,
  sendError,
  type ApiRequest,
  type ApiResponse,
} from './_lib.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } });
    return;
  }
  try {
    const uid = await requireUser(req);
    const bookingId = bookingIdFrom(req.body);
    const result = await createPaymentIntentForBooking(uid, bookingId);
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error, 'payment-intent');
  }
}
