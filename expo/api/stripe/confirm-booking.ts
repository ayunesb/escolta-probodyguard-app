/**
 * POST /api/stripe/confirm-booking
 * Header: Authorization: Bearer <Firebase ID token>
 * Body:   {"bookingId": "<id>"}
 *
 * La app lo llama cuando Stripe le reporta el pago. El servidor consulta el
 * PaymentIntent de la reserva y, si esta 'succeeded' y coincide en importe,
 * moneda y reserva, la pone en 'confirmed'. Idempotente.
 *
 * 200 {status: 'confirmed' | 'processing' | 'requires_payment' | 'canceled'}
 *     'processing' = OXXO/SPEI pendiente: el webhook confirmara despues.
 * 401 | 403 | 404 | 409 NO_PAYMENT_INTENT | BOOKING_NOT_PENDING | PAYMENT_MISMATCH | BOOKING_CHANGED
 */
import {
  applyCors,
  bookingIdFrom,
  confirmBookingPayment,
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
    const result = await confirmBookingPayment(bookingId, { uid });
    res.status(200).json(result);
  } catch (error) {
    sendError(res, error, 'confirm-booking');
  }
}
