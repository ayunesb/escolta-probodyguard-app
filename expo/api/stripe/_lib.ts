/**
 * Logica compartida de pagos con Stripe (funciones serverless de Vercel).
 * El guion bajo del nombre hace que Vercel NO lo publique como ruta.
 *
 * Variables de entorno (Vercel):
 *   FIREBASE_SERVICE_ACCOUNT  JSON completo de una cuenta de servicio del proyecto
 *   FIREBASE_DATABASE_URL     opcional; por defecto https://<project_id>-default-rtdb.firebaseio.com
 *   STRIPE_SECRET_KEY         sk_test_... / sk_live_...
 *   STRIPE_WEBHOOK_SECRET     whsec_... (solo webhook.ts)
 *   ALLOWED_ORIGINS           opcional, origenes extra separados por coma; admite
 *                             un comodin por subdominio, p. ej. https://escolta-pro-*.vercel.app
 *
 * Reglas de oro (CONTRACT §4):
 *  - El importe NUNCA viene del navegador: se recalcula con calculatePrice y la
 *    tarifa ACTUAL del escolta (Firestore users/{guardId}.hourlyRate).
 *  - Solo el servidor pone una reserva en 'confirmed', y solo con un
 *    PaymentIntent 'succeeded' cuyo importe, moneda, reserva y datos de precio
 *    coinciden con la reserva.
 *
 * Imports relativos con extension .js: el paquete es "type": "module" y Node
 * ESM (lo que ejecuta Vercel) no resuelve imports sin extension. TypeScript
 * mapea './x.js' a './x.ts'.
 */
import Stripe from 'stripe';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, type Reference } from 'firebase-admin/database';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { calculatePrice, PricingError, type PriceBreakdown } from '../../utils/pricing.js';

// ---------------------------------------------------------------------------
// Tipos minimos de la peticion/respuesta de Vercel (sin depender de @vercel/node)
// ---------------------------------------------------------------------------
export interface ApiRequest extends AsyncIterable<Buffer | string> {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

/** Respuesta JSON uniforme para cualquier error. */
export function sendError(res: ApiResponse, error: unknown, context: string): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.extra ?? {}) } });
    return;
  }
  const stripeError = error as { type?: string; message?: string; statusCode?: number };
  if (stripeError?.type && String(stripeError.type).startsWith('Stripe')) {
    console.error(`[Stripe] ${context}:`, stripeError.type, stripeError.message);
    res.status(502).json({ error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'The payment provider rejected the request' } });
    return;
  }
  console.error(`[Stripe] ${context}:`, error instanceof Error ? error.message : error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const DEFAULT_ORIGINS = [
  'https://escolta-pro-fe90e.web.app',
  'https://escolta-pro-fe90e.firebaseapp.com',
  'http://localhost:8081',
];

function originMatchers(): Array<(origin: string) => boolean> {
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  // El dominio de produccion del propio proyecto de Vercel, si existe.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) extra.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);

  return [...DEFAULT_ORIGINS, ...extra].map((entry) => {
    if (!entry.includes('*')) return (origin: string) => origin === entry;
    const escaped = entry.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`^${escaped.join('[a-z0-9-]+')}$`, 'i');
    return (origin: string) => re.test(origin);
  });
}

/** Aplica CORS. Devuelve true si ya respondio (preflight OPTIONS). */
export function applyCors(req: ApiRequest, res: ApiResponse, methods = 'POST, OPTIONS'): boolean {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && originMatchers().some((match) => match(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Firebase Admin y Stripe
// ---------------------------------------------------------------------------
export function adminApp(): App {
  if (getApps().length) return getApp();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new ApiError(503, 'SERVER_NOT_CONFIGURED', 'FIREBASE_SERVICE_ACCOUNT is not set');
  let account: Record<string, string>;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new ApiError(503, 'SERVER_NOT_CONFIGURED', 'FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  // Pegada en un panel de variables, la llave suele llegar con "\n" literales.
  if (typeof account.private_key === 'string') account.private_key = account.private_key.replace(/\\n/g, '\n');
  const projectId = account.project_id;
  return initializeApp({
    credential: cert(account as Parameters<typeof cert>[0]),
    projectId,
    databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
  });
}

let stripeSingleton: Stripe | null = null;
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ApiError(503, 'PAYMENTS_NOT_CONFIGURED', 'Payments are not configured');
  if (!stripeSingleton) stripeSingleton = new Stripe(key);
  return stripeSingleton;
}

/** Verifica `Authorization: Bearer <Firebase ID token>` y devuelve el uid. */
export async function requireUser(req: ApiRequest): Promise<string> {
  const header = String(req.headers.authorization ?? '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Missing Authorization bearer token');
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(match[1].trim());
    return decoded.uid;
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Invalid or expired ID token');
  }
}

// Caracteres que Realtime Database no admite en una clave.
const RTDB_KEY = /^[^.#$\[\]\/]{1,768}$/;

export function bookingIdFrom(body: unknown): string {
  let parsed = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }
  const bookingId = (parsed as { bookingId?: unknown } | null)?.bookingId;
  if (typeof bookingId !== 'string' || !RTDB_KEY.test(bookingId)) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'Body must be JSON {"bookingId": "<id>"}');
  }
  return bookingId;
}

// ---------------------------------------------------------------------------
// Reserva y precio
// ---------------------------------------------------------------------------
export interface Booking {
  clientId?: string;
  guardId?: string;
  status?: string;
  duration?: number;
  vehicleType?: 'standard' | 'armored';
  protectionType?: 'armed' | 'unarmed';
  numberOfProtectors?: number;
  hourlyRate?: number;
  totalAmount?: number;
  processingFee?: number;
  platformCut?: number;
  guardPayout?: number;
  paymentIntentId?: string;
  transactionId?: string;
  [key: string]: unknown;
}

function bookingRef(bookingId: string): Reference {
  return getDatabase(adminApp()).ref(`bookings/${bookingId}`);
}

async function loadOwnBooking(uid: string, bookingId: string): Promise<Booking> {
  const booking = (await bookingRef(bookingId).get()).val() as Booking | null;
  if (!booking) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');
  if (booking.clientId !== uid) throw new ApiError(403, 'FORBIDDEN', 'This booking is not yours');
  return booking;
}

/** Lo que determina el precio. Viaja en la metadata del PaymentIntent. */
interface PriceInputs {
  guardId: string;
  hourlyRate: number;
  duration: number;
  vehicleType: 'standard' | 'armored';
  protectionType: 'armed' | 'unarmed';
  numberOfProtectors: number;
}

function priceInputsMetadata(p: PriceInputs): Record<string, string> {
  return {
    guardId: p.guardId,
    hourlyRate: String(p.hourlyRate),
    duration: String(p.duration),
    vehicleType: p.vehicleType,
    protectionType: p.protectionType,
    numberOfProtectors: String(p.numberOfProtectors),
  };
}

function priceInputsFromMetadata(meta: Stripe.Metadata): PriceInputs | null {
  const p = {
    guardId: meta.guardId,
    hourlyRate: Number(meta.hourlyRate),
    duration: Number(meta.duration),
    vehicleType: meta.vehicleType as PriceInputs['vehicleType'],
    protectionType: meta.protectionType as PriceInputs['protectionType'],
    numberOfProtectors: Number(meta.numberOfProtectors),
  };
  return p.guardId && Number.isFinite(p.hourlyRate) ? p : null;
}

/** La reserva conserva exactamente las opciones con las que se cobro. */
function bookingMatchesInputs(b: Booking, p: PriceInputs): boolean {
  return (
    b.guardId === p.guardId &&
    b.duration === p.duration &&
    b.vehicleType === p.vehicleType &&
    b.protectionType === p.protectionType &&
    b.numberOfProtectors === p.numberOfProtectors
  );
}

function canonicalAmounts(p: PriceInputs, breakdown: PriceBreakdown) {
  return {
    hourlyRate: p.hourlyRate,
    totalAmount: breakdown.total,
    processingFee: breakdown.processingFee,
    platformCut: breakdown.platformCut,
    guardPayout: breakdown.guardPayout,
  };
}

function price(p: PriceInputs): PriceBreakdown {
  try {
    return calculatePrice(p);
  } catch (error) {
    if (error instanceof PricingError) throw new ApiError(422, 'INVALID_BOOKING', error.message);
    throw error;
  }
}

async function currentPriceInputs(booking: Booking): Promise<PriceInputs> {
  if (typeof booking.guardId !== 'string' || !booking.guardId) {
    throw new ApiError(422, 'INVALID_BOOKING', 'Booking has no guard');
  }
  const guardSnap = await getFirestore(adminApp()).doc(`users/${booking.guardId}`).get();
  const guard = guardSnap.data();
  if (!guardSnap.exists || guard?.role !== 'guard') throw new ApiError(422, 'INVALID_BOOKING', 'Guard not found');
  if (guard.isActive === false || guard.suspended === true) {
    throw new ApiError(409, 'GUARD_UNAVAILABLE', 'This guard is not available; choose another guard');
  }
  if (guard.kycStatus !== 'approved') {
    throw new ApiError(409, 'GUARD_NOT_VERIFIED', 'This guard has not been verified yet; choose another guard');
  }
  return {
    guardId: booking.guardId,
    hourlyRate: Number(guard.hourlyRate),
    duration: Number(booking.duration),
    vehicleType: booking.vehicleType as PriceInputs['vehicleType'],
    protectionType: booking.protectionType as PriceInputs['protectionType'],
    numberOfProtectors: Number(booking.numberOfProtectors),
  };
}

const REUSABLE_PI_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

// ---------------------------------------------------------------------------
// POST /api/stripe/payment-intent
// ---------------------------------------------------------------------------
export async function createPaymentIntentForBooking(uid: string, bookingId: string) {
  const stripe = stripeClient();
  const booking = await loadOwnBooking(uid, bookingId);
  if (booking.status !== 'pending') {
    throw new ApiError(409, 'BOOKING_NOT_PENDING', `Booking is ${booking.status}, not pending`, { bookingStatus: booking.status });
  }

  const inputs = await currentPriceInputs(booking);
  const breakdown = price(inputs);
  const amounts = canonicalAmounts(inputs, breakdown);

  // Importes canonicos en la reserva, solo si nadie cambio las opciones entre
  // la lectura y esta escritura.
  const priced = await bookingRef(bookingId).transaction((current: Booking | null) => {
    if (current === null) return null;
    if (current.status !== 'pending' || current.clientId !== uid || !bookingMatchesInputs(current, inputs)) return undefined;
    return { ...current, ...amounts };
  });
  if (!priced.committed || !priced.snapshot.exists()) {
    throw new ApiError(409, 'BOOKING_CHANGED', 'The booking changed while pricing it; try again');
  }

  // Si ya hay un intento de pago para esta reserva, reutilizarlo o anularlo.
  if (booking.paymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    if (existing.status === 'succeeded' || existing.status === 'processing') {
      const result = await confirmBookingPayment(bookingId, { paymentIntent: existing });
      throw new ApiError(409, 'BOOKING_ALREADY_PAID', 'This booking already has a payment', { paymentStatus: result.status });
    }
    if (existing.amount === breakdown.totalCents && REUSABLE_PI_STATUSES.has(existing.status)) {
      return { clientSecret: existing.client_secret, paymentIntentId: existing.id, breakdown };
    }
    if (existing.status !== 'canceled') {
      // Importe viejo: que ya no se pueda pagar.
      await stripe.paymentIntents.cancel(existing.id).catch((e: Error) =>
        console.warn('[Stripe] Could not cancel stale PaymentIntent', existing.id, e.message)
      );
    }
  }

  const params: Stripe.PaymentIntentCreateParams = {
    amount: breakdown.totalCents,
    currency: 'mxn',
    automatic_payment_methods: { enabled: true },
    description: `Escolta Pro - reserva ${bookingId}`,
    metadata: { bookingId, clientId: uid, totalCents: String(breakdown.totalCents), ...priceInputsMetadata(inputs) },
  };
  // La llave incluye el importe: si cambia el precio sale un intento nuevo, y
  // un doble clic con el mismo precio no crea dos.
  let intent = await stripe.paymentIntents.create(params, {
    idempotencyKey: `booking_${bookingId}_${breakdown.totalCents}`,
  });
  if (intent.status === 'canceled') {
    // La llave apunto a un intento que ya anulamos (el precio volvio a su valor anterior).
    intent = await stripe.paymentIntents.create(params, {
      idempotencyKey: `booking_${bookingId}_${breakdown.totalCents}_${Date.now()}`,
    });
  }

  const stored = await bookingRef(bookingId).transaction((current: Booking | null) => {
    if (current === null) return null;
    if (current.status !== 'pending') return undefined;
    return { ...current, paymentIntentId: intent.id };
  });
  if (!stored.committed || !stored.snapshot.exists()) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    throw new ApiError(409, 'BOOKING_NOT_PENDING', 'The booking is no longer pending');
  }

  return { clientSecret: intent.client_secret, paymentIntentId: intent.id, breakdown };
}

// ---------------------------------------------------------------------------
// POST /api/stripe/confirm-booking y webhook payment_intent.succeeded
// ---------------------------------------------------------------------------
export type ConfirmStatus = 'confirmed' | 'processing' | 'requires_payment';

/**
 * Pone la reserva en 'confirmed' si (y solo si) el PaymentIntent de esa
 * reserva esta 'succeeded' y coincide en importe, moneda, reserva, cliente y
 * datos de precio. Idempotente.
 *
 * `uid` presente = llamada del cliente (debe ser el dueno). Ausente = webhook.
 */
export async function confirmBookingPayment(
  bookingId: string,
  opts: { uid?: string; paymentIntent?: Stripe.PaymentIntent } = {}
): Promise<{ status: ConfirmStatus | string }> {
  const booking = opts.uid
    ? await loadOwnBooking(opts.uid, bookingId)
    : ((await bookingRef(bookingId).get()).val() as Booking | null);
  if (!booking) throw new ApiError(404, 'NOT_FOUND', 'Booking not found');

  const pi = opts.paymentIntent ?? (booking.paymentIntentId ? await stripeClient().paymentIntents.retrieve(booking.paymentIntentId) : null);
  if (!pi) throw new ApiError(409, 'NO_PAYMENT_INTENT', 'This booking has no payment in progress');

  // Ya confirmada con este mismo pago: nada que hacer.
  if (booking.status !== 'pending') {
    if (booking.transactionId === pi.id) return { status: 'confirmed' };
    if (pi.status === 'succeeded') await recordAnomaly(bookingId, pi, `booking is ${booking.status}`);
    throw new ApiError(409, 'BOOKING_NOT_PENDING', `Booking is ${booking.status}, not pending`, { bookingStatus: booking.status });
  }

  if (pi.status === 'processing') return { status: 'processing' };
  if (pi.status !== 'succeeded') return { status: pi.status === 'canceled' ? 'canceled' : 'requires_payment' };

  const inputs = priceInputsFromMetadata(pi.metadata ?? {});
  const problems: string[] = [];
  if (pi.id !== booking.paymentIntentId) problems.push('not the booking payment intent');
  if (pi.currency !== 'mxn') problems.push(`currency ${pi.currency}`);
  if (pi.metadata?.bookingId !== bookingId) problems.push('metadata.bookingId mismatch');
  if (pi.metadata?.clientId !== booking.clientId) problems.push('metadata.clientId mismatch');
  if (!inputs) problems.push('missing price metadata');
  if (pi.amount !== Math.round(Number(booking.totalAmount) * 100)) problems.push('amount differs from booking total');
  if (inputs) {
    if (!bookingMatchesInputs(booking, inputs)) problems.push('booking options changed after pricing');
    if (price(inputs).totalCents !== pi.amount) problems.push('amount differs from canonical price');
  }
  if (problems.length) {
    await recordAnomaly(bookingId, pi, problems.join('; '));
    throw new ApiError(409, 'PAYMENT_MISMATCH', 'The payment does not match this booking; support has been notified');
  }

  const breakdown = price(inputs!);
  const amounts = canonicalAmounts(inputs!, breakdown);
  const confirmedAt = new Date().toISOString();
  const result = await bookingRef(bookingId).transaction((current: Booking | null) => {
    if (current === null) return null;
    if (current.status !== 'pending') return undefined;
    if (current.paymentIntentId !== pi.id || !bookingMatchesInputs(current, inputs!)) return undefined;
    return {
      ...current,
      ...amounts,
      status: 'confirmed',
      confirmedAt,
      transactionId: pi.id,
      paymentProvider: 'stripe',
    };
  });

  const after = result.snapshot.val() as Booking | null;
  if (after?.status !== 'pending' && after?.transactionId === pi.id) {
    // Registro del servidor. Sin merge: si un cliente hubiera creado antes un
    // documento con este id, se reemplaza completo.
    await getFirestore(adminApp()).doc(`payments/${bookingId}`).set({
      bookingId,
      clientId: booking.clientId,
      guardId: booking.guardId ?? null,
      amount: breakdown.total,
      processingFee: breakdown.processingFee,
      platformCut: breakdown.platformCut,
      guardPayout: breakdown.guardPayout,
      currency: 'MXN',
      provider: 'stripe',
      transactionId: pi.id,
      status: 'completed',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { status: 'confirmed' };
  }

  await recordAnomaly(bookingId, pi, 'booking changed while confirming');
  throw new ApiError(409, 'BOOKING_CHANGED', 'The booking changed while confirming the payment; support has been notified');
}

/** Pago cobrado que no se pudo aplicar: queda para revision/reembolso manual. */
async function recordAnomaly(bookingId: string, pi: Stripe.PaymentIntent, reason: string): Promise<void> {
  console.error('[Stripe] Payment anomaly', bookingId, pi.id, reason);
  try {
    await getFirestore(adminApp()).doc(`payment_anomalies/${pi.id}`).set(
      {
        bookingId,
        paymentIntentId: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        paymentStatus: pi.status,
        reason,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('[Stripe] Could not record anomaly', error instanceof Error ? error.message : error);
  }
}

/** Cuerpo crudo (el webhook necesita los bytes exactos para verificar la firma). */
export async function readRawBody(req: ApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}
