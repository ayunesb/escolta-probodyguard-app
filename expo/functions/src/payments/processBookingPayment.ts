/**
 * Cobro con Braintree de una reserva (app nativa). CONTRACT §4.
 *
 * El cliente solo manda {bookingId, paymentMethodNonce | paymentMethodToken}.
 * El importe NUNCA viene del telefono: se recalcula aqui con la tarifa ACTUAL
 * del escolta y las opciones guardadas en la reserva, se cobra en la cuenta
 * de comercio MXN con 2 decimales, y la reserva pasa a 'confirmed' en el
 * servidor. El cliente jamas escribe status:'confirmed' (las reglas de RTDB
 * se lo impiden).
 */
import * as admin from 'firebase-admin';
import { gateway } from '../config/braintree';
import { calculatePrice, amountsMatch, PricingError, PriceBreakdown } from '../pricing';
import { sendAdminAlert } from '../alerts';

export class PaymentError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

// Caracteres que Realtime Database no admite en una clave.
const RTDB_KEY = /^[^.#$\[\]\/]{1,768}$/;

export interface ProcessInput {
  uid: string;
  bookingId: unknown;
  paymentMethodNonce?: unknown;
  paymentMethodToken?: unknown;
  deviceData?: unknown;
  saveCard?: unknown;
}

export interface ProcessResult {
  transactionId: string;
  status: 'confirmed';
  breakdown: PriceBreakdown;
}

const LOCK_TTL_MS = 2 * 60 * 1000;

/** Opciones que determinan el precio. Si cambian durante el cobro, se anula. */
const PRICE_INPUTS = ['guardId', 'duration', 'vehicleType', 'protectionType', 'numberOfProtectors'] as const;

function mxn2(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function assertTokenBelongsTo(token: string, uid: string): Promise<void> {
  try {
    const pm = await (gateway as any).paymentMethod.find(token);
    if (!pm || pm.customerId !== uid) {
      throw new PaymentError(403, 'FORBIDDEN', 'Payment method does not belong to this user');
    }
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(403, 'FORBIDDEN', 'Payment method not found');
  }
}

/** El cliente de Braintree de cada usuario usa su uid como id. */
export async function ensureCustomer(uid: string): Promise<void> {
  try {
    await (gateway as any).customer.find(uid);
  } catch (error: any) {
    if (error?.type !== 'notFoundError') throw error;
    const created = await (gateway as any).customer.create({ id: uid });
    if (!created?.success) throw new Error(created?.message || 'Could not create Braintree customer');
  }
}

export async function processBookingPayment(input: ProcessInput): Promise<ProcessResult> {
  const { uid } = input;
  const bookingId = typeof input.bookingId === 'string' ? input.bookingId : '';
  const nonce = typeof input.paymentMethodNonce === 'string' && input.paymentMethodNonce ? input.paymentMethodNonce : null;
  const token = typeof input.paymentMethodToken === 'string' && input.paymentMethodToken ? input.paymentMethodToken : null;
  const deviceData = typeof input.deviceData === 'string' ? input.deviceData : undefined;
  const saveCard = input.saveCard === true;

  if (!RTDB_KEY.test(bookingId)) throw new PaymentError(400, 'INVALID_ARGUMENT', 'Missing or invalid bookingId');
  if (!nonce === !token) {
    throw new PaymentError(400, 'INVALID_ARGUMENT', 'Send exactly one of paymentMethodNonce or paymentMethodToken');
  }
  if (!gateway) throw new PaymentError(503, 'PAYMENT_CONFIG_ERROR', 'Payment system is not configured');
  const merchantAccountId = process.env.BRAINTREE_MERCHANT_ACCOUNT_ID;
  if (!merchantAccountId) {
    // Sin la cuenta de comercio en MXN, Braintree cobraria en la moneda por
    // defecto de la cuenta (normalmente USD). Mejor no cobrar.
    throw new PaymentError(503, 'PAYMENT_CONFIG_ERROR', 'BRAINTREE_MERCHANT_ACCOUNT_ID (MXN) is not configured');
  }

  const bookingRef = admin.database().ref(`bookings/${bookingId}`);
  const booking = (await bookingRef.get()).val();
  if (!booking) throw new PaymentError(404, 'NOT_FOUND', 'Booking not found');
  if (booking.clientId !== uid) throw new PaymentError(403, 'FORBIDDEN', 'This booking is not yours');
  if (booking.status !== 'pending') {
    throw new PaymentError(409, 'BOOKING_NOT_PENDING', `Booking is ${booking.status}, not pending`, { bookingStatus: booking.status });
  }
  if (typeof booking.guardId !== 'string' || !booking.guardId) {
    throw new PaymentError(422, 'INVALID_BOOKING', 'Booking has no guard');
  }

  const guardSnap = await admin.firestore().doc(`users/${booking.guardId}`).get();
  const guard = guardSnap.data();
  if (!guardSnap.exists || guard?.role !== 'guard') throw new PaymentError(422, 'INVALID_BOOKING', 'Guard not found');
  const hourlyRate = Number(guard?.hourlyRate);

  let breakdown: PriceBreakdown;
  try {
    breakdown = calculatePrice({
      hourlyRate,
      duration: Number(booking.duration),
      vehicleType: booking.vehicleType,
      protectionType: booking.protectionType,
      numberOfProtectors: Number(booking.numberOfProtectors),
    });
  } catch (error) {
    if (error instanceof PricingError) throw new PaymentError(422, 'INVALID_BOOKING', error.message);
    throw error;
  }

  const canonical = {
    hourlyRate,
    totalAmount: breakdown.total,
    processingFee: breakdown.processingFee,
    platformCut: breakdown.platformCut,
    guardPayout: breakdown.guardPayout,
  };

  // Si el precio que vio el cliente ya no es el real (el escolta cambio su
  // tarifa), no se cobra: se guardan los importes correctos y la app debe
  // mostrarlos y volver a pedir confirmacion.
  if (!amountsMatch(booking.totalAmount, breakdown.total)) {
    await bookingRef.update(canonical);
    throw new PaymentError(409, 'PRICE_CHANGED', 'The price changed; review the new total and pay again', { breakdown });
  }

  // Candado: un doble toque no cobra dos veces.
  const lockRef = admin.database().ref(`paymentLocks/${bookingId}`);
  const lock = await lockRef.transaction((current) => {
    if (current && typeof current.at === 'number' && Date.now() - current.at < LOCK_TTL_MS) return undefined;
    return { uid, at: Date.now() };
  });
  if (!lock.committed) throw new PaymentError(409, 'PAYMENT_IN_PROGRESS', 'A payment for this booking is already in progress');

  try {
    if (token) await assertTokenBelongsTo(token, uid);
    if (nonce && saveCard) await ensureCustomer(uid);

    const sale: Record<string, any> = {
      amount: mxn2(breakdown.totalCents),
      merchantAccountId,
      orderId: bookingId,
      deviceData,
      options: {
        submitForSettlement: true,
        threeDSecure: { required: process.env.BRAINTREE_3DS_REQUIRED === 'true' },
      },
    };
    if (token) {
      sale.paymentMethodToken = token;
    } else {
      sale.paymentMethodNonce = nonce;
      if (saveCard) {
        sale.customerId = uid;
        sale.options.storeInVaultOnSuccess = true;
      }
    }

    const result = await (gateway as any).transaction.sale(sale);
    await admin.firestore().collection('payment_attempts').add({
      userId: uid,
      bookingId,
      amount: breakdown.total,
      currency: 'MXN',
      status: result?.success ? 'success' : 'failed',
      transactionId: result?.transaction?.id ?? null,
      error: result?.success ? null : String(result?.message ?? 'unknown'),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!result?.success || !result.transaction?.id) {
      throw new PaymentError(402, 'PAYMENT_DECLINED', String(result?.message ?? 'Payment was declined'));
    }
    const transactionId: string = result.transaction.id;

    // Confirmar SOLO si la reserva sigue igual que cuando se calculo el precio.
    const confirmedAt = new Date().toISOString();
    const confirm = await bookingRef.transaction((current) => {
      if (current === null) return null;
      if (current.status !== 'pending' || current.clientId !== uid) return undefined;
      for (const key of PRICE_INPUTS) {
        if (current[key] !== booking[key]) return undefined;
      }
      return {
        ...current,
        ...canonical,
        status: 'confirmed',
        confirmedAt,
        transactionId,
        paymentProvider: 'braintree',
      };
    });
    const after = confirm.snapshot.val();
    if (!confirm.committed || after?.status !== 'confirmed' || after?.transactionId !== transactionId) {
      // La reserva cambio (cancelada o editada) mientras se cobraba: anular.
      try {
        await (gateway as any).transaction.void(transactionId);
      } catch (voidError) {
        console.error('[ProcessPayment] Could not void transaction', transactionId, voidError);
        await sendAdminAlert({
          type: 'payment_void_failed',
          severity: 'critical',
          title: 'Anular transaccion manualmente',
          body: `La reserva ${bookingId} cambio durante el cobro y no se pudo anular ${transactionId}.`,
          data: { bookingId, transactionId },
        });
      }
      throw new PaymentError(409, 'BOOKING_CHANGED', 'The booking changed during payment; the charge was voided');
    }

    await admin.firestore().doc(`payments/${bookingId}`).set({
      bookingId,
      clientId: uid,
      guardId: booking.guardId,
      amount: breakdown.total,
      processingFee: breakdown.processingFee,
      platformCut: breakdown.platformCut,
      guardPayout: breakdown.guardPayout,
      currency: 'MXN',
      provider: 'braintree',
      transactionId,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { transactionId, status: 'confirmed', breakdown };
  } finally {
    await lockRef.remove().catch(() => undefined);
  }
}
