import { onRequest, HttpsError, onCall, CallableRequest } from 'firebase-functions/v2/https';
import {
  handleSubscriptionChargedSuccessfully,
  handleSubscriptionChargedUnsuccessfully,
  handleSubscriptionCanceled,
  handleSubscriptionExpired,
  handleDisputeOpened,
  handleDisputeLost,
  handleDisputeWon,
  handleTransactionSettled,
  handleTransactionSettlementDeclined,
  handleDisbursement,
  handleDisbursementException,
} from './webhooks/braintreeHandlers';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import express, { Request, Response } from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { gateway, isGatewayConfigured, getConfigurationError } from './config/braintree';
import { AuthedRequest, requireAdmin, requireAuth, requireSelf, roleOf } from './auth';
import { PaymentError, ensureCustomer, processBookingPayment } from './payments/processBookingPayment';

/**
 * Verdadero solo dentro de una corrida de Jest en una maquina de desarrollo.
 *
 * Algunos endpoints tienen un atajo que devuelve datos falsos para que las
 * pruebas corran sin credenciales de Braintree. Exige ademas que NO estemos
 * en la nube: Cloud Functions v2 / Cloud Run siempre inyectan K_SERVICE y
 * Cloud Functions inyecta FUNCTION_TARGET. El cobro (/payments/process) NO
 * tiene atajo.
 */
function esPruebaUnitariaJest(): boolean {
  const enLaNube = Boolean(
    process.env.K_SERVICE ||       // Cloud Run y Cloud Functions v2
    process.env.FUNCTION_TARGET || // Cloud Functions
    process.env.GAE_ENV            // App Engine
  );
  if (enLaNube) return false;
  return process.env.NODE_ENV === 'test' && Boolean(process.env.JEST_WORKER_ID);
}

admin.initializeApp();

const app = express();
// La autenticacion es por token Bearer, no por cookies: reflejar el origen
// no abre CSRF.
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));
// Braintree manda los webhooks como application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

function configError(res: Response): void {
  res.status(503).json(getConfigurationError());
}

// === Payments routes (mobile expects /payments/*) ===
// Todas exigen `Authorization: Bearer <Firebase ID token>` salvo la pagina
// estatica de Hosted Fields (se carga en un WebView y no recibe datos por URL).

app.get('/payments/client-token', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    if (esPruebaUnitariaJest()) {
      res.json({ clientToken: 'mock-client-token-for-testing' });
      return;
    }
    if (!isGatewayConfigured() || !gateway) {
      configError(res);
      return;
    }

    const merchantAccountId = process.env.BRAINTREE_MERCHANT_ACCOUNT_ID;
    const result = await (gateway as any).clientToken.generate(merchantAccountId ? { merchantAccountId } : {});
    const clientToken = result?.clientToken;
    if (!clientToken) throw new Error('Braintree returned empty client token');
    res.json({ clientToken });
  } catch (error) {
    console.error('[ClientToken] Generation failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: { code: 'PAYMENT_TOKEN_GENERATION_FAILED', message: 'Unable to initialize payment. Please try again.' },
    });
  }
});

// Pagina de Hosted Fields para el WebView. Recibe el client token por
// postMessage, nunca por la URL.
app.get('/payments/hosted-fields-page', async (_req: Request, res: Response) => {
  try {
    const htmlPath = path.join(__dirname, 'payments', 'hostedFieldsPage.html');
    if (!fs.existsSync(htmlPath)) {
      res.status(404).send('Hosted Fields page not found');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(fs.readFileSync(htmlPath, 'utf8'));
  } catch (error) {
    console.error('[HostedFieldsPage] Error:', error);
    res.status(500).send('Internal server error');
  }
});

/**
 * Cobra una reserva. Body: {bookingId, paymentMethodNonce | paymentMethodToken,
 * deviceData?, saveCard?}. El importe se recalcula en el servidor.
 * Respuestas: 200 {success, transactionId, status:'confirmed', breakdown};
 * 409 {error:{code:'PRICE_CHANGED', breakdown}} si la tarifa cambio;
 * 409 BOOKING_NOT_PENDING / PAYMENT_IN_PROGRESS / BOOKING_CHANGED;
 * 402 PAYMENT_DECLINED; 403; 404; 422; 503 sin configuracion.
 */
app.post('/payments/process', requireAuth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  try {
    const result = await processBookingPayment({
      uid: req.uid!,
      bookingId: body.bookingId,
      paymentMethodNonce: body.paymentMethodNonce,
      paymentMethodToken: body.paymentMethodToken,
      deviceData: body.deviceData,
      saveCard: body.saveCard,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PaymentError) {
      res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, ...(error.extra ?? {}) } });
      return;
    }
    console.error('[ProcessPayment] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      bookingId: typeof body.bookingId === 'string' ? body.bookingId : null,
    });
    res.status(500).json({
      success: false,
      error: { code: 'PAYMENT_PROCESSING_FAILED', message: 'Payment could not be processed. Please try again.' },
    });
  }
});

// Reembolsos: solo administradores.
app.post('/payments/refund', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const { transactionId, amount, bookingId, reason } = req.body ?? {};
    if (typeof transactionId !== 'string' || !transactionId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ARGUMENT', message: 'transactionId is required' } });
      return;
    }
    let refundAmount: string | undefined;
    if (amount !== undefined && amount !== null) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) {
        res.status(400).json({ success: false, error: { code: 'INVALID_ARGUMENT', message: 'amount must be a positive number' } });
        return;
      }
      refundAmount = (Math.round(n * 100) / 100).toFixed(2);
    }
    if (!gateway) {
      configError(res);
      return;
    }

    const result = await (gateway as any).transaction.refund(transactionId, refundAmount);
    if (!result?.success) {
      res.status(400).json({ success: false, error: { code: 'REFUND_FAILED', message: result?.message ?? 'Refund failed' } });
      return;
    }

    await admin.firestore().collection('refunds').add({
      transactionId,
      refundId: result.transaction?.id ?? null,
      bookingId: typeof bookingId === 'string' ? bookingId : null,
      amount: refundAmount ?? null,
      reason: typeof reason === 'string' ? reason.slice(0, 500) : null,
      currency: 'MXN',
      status: 'completed',
      processedBy: req.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, refundId: result.transaction?.id });
  } catch (error) {
    console.error('[Refund] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      success: false,
      error: { code: 'REFUND_PROCESSING_FAILED', message: 'Unable to process refund. Please try again or contact support.' },
    });
  }
});

/**
 * Guarda (vault) un metodo de pago para el usuario autenticado. El cliente
 * de Braintree usa el uid como id. verifyCard y failOnDuplicatePaymentMethod
 * reducen fraude y duplicados.
 */
export async function handleCreatePaymentMethod(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    if (!req.uid || req.uid !== userId) {
      res.status(403).json({ success: false, error: 'You can only add payment methods to your own account' });
      return;
    }
    const { payment_method_nonce, cardholder_name, billing_address, make_default, verify_card } = req.body || {};
    if (typeof payment_method_nonce !== 'string' || !payment_method_nonce) {
      res.status(400).json({ success: false, error: 'payment_method_nonce is required' });
      return;
    }

    if (esPruebaUnitariaJest()) {
      res.status(201).json({ success: true, token: 'unit-test-token', type: 'CreditCard' });
      return;
    }
    if (!gateway) {
      configError(res);
      return;
    }

    await ensureCustomer(userId);

    const createParams: Record<string, any> = {
      customerId: userId,
      paymentMethodNonce: payment_method_nonce,
      options: {
        verifyCard: verify_card !== undefined ? !!verify_card : true,
        failOnDuplicatePaymentMethod: true,
        ...(process.env.BRAINTREE_MERCHANT_ACCOUNT_ID
          ? { verificationMerchantAccountId: process.env.BRAINTREE_MERCHANT_ACCOUNT_ID }
          : {}),
        ...(make_default ? { makeDefault: true } : {}),
      },
    };
    if (typeof cardholder_name === 'string') createParams.cardholderName = cardholder_name;
    if (billing_address && typeof billing_address === 'object') createParams.billingAddress = billing_address;

    const result = await (gateway as any).paymentMethod.create(createParams);
    if (result?.success) {
      const pm = result.paymentMethod;
      res.status(201).json({ success: true, token: pm.token, type: pm.__type || pm.type });
      return;
    }

    console.error('[PaymentMethod] create failed:', result?.message);
    res.status(400).json({ success: false, error: result?.message || 'Failed to create payment method' });
  } catch (error) {
    console.error('[PaymentMethod] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

app.post('/payments/methods/:userId', requireAuth, requireSelf('userId'), handleCreatePaymentMethod);

// Lista los metodos de pago guardados del usuario autenticado.
app.get('/payments/methods/:userId', requireAuth, requireSelf('userId'), async (req: AuthedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (esPruebaUnitariaJest()) {
      res.json({
        success: true,
        paymentMethods: [
          { token: 'mock-pm-1', type: 'CreditCard', default: true, cardType: 'Visa', maskedNumber: '****1111' },
          { token: 'mock-pm-2', type: 'CreditCard', default: false, cardType: 'MasterCard', maskedNumber: '****4444' },
        ],
      });
      return;
    }
    if (!gateway) {
      configError(res);
      return;
    }

    const customer = await (gateway as any).customer.find(userId);
    const paymentMethods = (customer?.paymentMethods || []).map((pm: any) => ({
      token: pm.token,
      type: pm.__type || pm.type,
      default: pm.default,
      cardType: pm.cardType || pm.brand,
      maskedNumber: pm.maskedNumber,
      last4: pm.last4,
      expirationMonth: pm.expirationMonth,
      expirationYear: pm.expirationYear,
    }));
    res.json({ success: true, paymentMethods });
  } catch (error) {
    if ((error as any)?.type === 'notFoundError') {
      // Sin cliente en Braintree = sin tarjetas guardadas.
      res.json({ success: true, paymentMethods: [] });
      return;
    }
    console.error('[ListPaymentMethods] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Borra un metodo de pago SOLO si pertenece al usuario autenticado.
app.delete('/payments/methods/:userId/:token', requireAuth, requireSelf('userId'), async (req: AuthedRequest, res: Response) => {
  try {
    const { userId, token } = req.params;
    if (esPruebaUnitariaJest()) {
      res.json({ success: true });
      return;
    }
    if (!gateway) {
      configError(res);
      return;
    }

    let owner: string | null = null;
    try {
      const pm = await (gateway as any).paymentMethod.find(token);
      owner = pm?.customerId ?? null;
    } catch {
      owner = null;
    }
    if (owner !== userId) {
      res.status(404).json({ success: false, error: 'Payment method not found' });
      return;
    }

    await (gateway as any).paymentMethod.delete(token);
    res.json({ success: true });
  } catch (error) {
    console.error('[DeleteMethod] Error:', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, error: 'Failed to delete payment method' });
  }
});

/**
 * Webhook de Braintree. Sin token de Firebase (lo llama Braintree): se
 * autentica por la firma bt_signature. Cada payload se procesa UNA vez:
 * webhook_events/{sha256(bt_payload)} se crea con create(), que falla si ya
 * existe. Si el procesamiento falla se borra el candado y se responde 500
 * para que Braintree reintente.
 */
app.post('/webhooks/braintree', async (req: Request, res: Response) => {
  const bt_signature = (req.body?.bt_signature ?? req.query.bt_signature) as string | undefined;
  const bt_payload = (req.body?.bt_payload ?? req.query.bt_payload) as string | undefined;

  if (typeof bt_signature !== 'string' || typeof bt_payload !== 'string' || !bt_signature || !bt_payload) {
    res.status(400).json({ error: 'Missing signature or payload' });
    return;
  }
  if (!gateway) {
    configError(res);
    return;
  }

  let webhookNotification: any;
  try {
    webhookNotification = await (gateway as any).webhookNotification.parse(bt_signature, bt_payload);
  } catch {
    console.error('[Webhook] Signature verification failed');
    res.status(403).json({ error: 'Invalid webhook signature' });
    return;
  }

  const db = admin.firestore();
  const kind: string = webhookNotification.kind;
  const eventId = crypto.createHash('sha256').update(bt_payload).digest('hex');
  const eventRef = db.collection('webhook_events').doc(eventId);

  try {
    await eventRef.create({ kind, status: 'processing', receivedAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (error: any) {
    if (error?.code === 6 || /already exists/i.test(String(error?.message))) {
      console.log('[Webhook] Duplicate delivery ignored:', kind, eventId);
      res.status(200).json({ success: true, duplicate: true });
      return;
    }
    console.error('[Webhook] Could not record event:', error?.message);
    res.status(500).json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Webhook could not be processed' } });
    return;
  }

  try {
    await db.collection('webhook_logs').add({
      kind,
      eventId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      subjectId:
        webhookNotification.transaction?.id ??
        webhookNotification.dispute?.id ??
        webhookNotification.subscription?.id ??
        webhookNotification.disbursement?.id ??
        null,
      verified: true,
    });

    switch (kind) {
      case 'subscription_charged_successfully':
        await handleSubscriptionChargedSuccessfully(webhookNotification);
        break;
      case 'subscription_charged_unsuccessfully':
        await handleSubscriptionChargedUnsuccessfully(webhookNotification);
        break;
      case 'subscription_canceled':
        await handleSubscriptionCanceled(webhookNotification);
        break;
      case 'subscription_expired':
        await handleSubscriptionExpired(webhookNotification);
        break;
      case 'dispute_opened':
        await handleDisputeOpened(webhookNotification);
        break;
      case 'dispute_lost':
        await handleDisputeLost(webhookNotification);
        break;
      case 'dispute_won':
        await handleDisputeWon(webhookNotification);
        break;
      case 'transaction_settled':
        await handleTransactionSettled(webhookNotification);
        break;
      case 'transaction_settlement_declined':
        await handleTransactionSettlementDeclined(webhookNotification);
        break;
      case 'disbursement':
        await handleDisbursement(webhookNotification);
        break;
      case 'disbursement_exception':
        await handleDisbursementException(webhookNotification);
        break;
      case 'check':
        break;
      default:
        await db.collection('unhandled_webhooks').add({
          kind,
          eventId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    await eventRef.set({ status: 'processed', processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Processing error:', error instanceof Error ? error.message : 'Unknown error');
    await eventRef.delete().catch(() => undefined);
    res.status(500).json({ error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Webhook could not be processed' } });
  }
});

export { app };
export const api = onRequest(app);

/**
 * Semanal: prepara las solicitudes de pago a escoltas. NO mueve dinero (no
 * hay integracion de dispersion todavia), asi que ya no las marca
 * 'completed' ni descuenta el saldo del escolta en el ledger: las deja en
 * 'ready_for_transfer' para que un administrador haga la transferencia y,
 * al hacerla, marque el pago como completado y registre la salida en el
 * ledger.
 */
export const processPayouts = onSchedule('every monday 09:00', async () => {
  const db = admin.firestore();
  try {
    const pending = await db.collection('payouts').where('status', '==', 'pending').get();
    for (const doc of pending.docs) {
      try {
        await doc.ref.set({
          status: 'ready_for_transfer',
          readyAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        console.error('[ProcessPayouts] Error preparing payout:', doc.id, error);
      }
    }
    console.log('[ProcessPayouts] Payouts ready for manual transfer:', pending.size);
  } catch (error) {
    console.error('[ProcessPayouts] Error:', error);
  }
});

/**
 * Factura de una reserva. Las reservas viven en Realtime Database; antes esto
 * leia la coleccion `bookings` de Firestore (vacia) y cualquier usuario podia
 * pedir la factura de cualquier reserva.
 */
export const generateInvoice = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  const bookingId = (request.data as { bookingId?: unknown })?.bookingId;
  if (typeof bookingId !== 'string' || !/^[^.#$\[\]\/]{1,768}$/.test(bookingId)) {
    throw new HttpsError('invalid-argument', 'bookingId is required');
  }

  const snap = await admin.database().ref(`bookings/${bookingId}`).get();
  const booking = snap.val();
  if (!booking) throw new HttpsError('not-found', 'Booking not found');

  const isOwner = booking.clientId === request.auth.uid;
  if (!isOwner && (await roleOf(request.auth.uid)) !== 'admin') {
    throw new HttpsError('permission-denied', 'This booking is not yours');
  }
  if (!['confirmed', 'accepted', 'en_route', 'active', 'completed'].includes(booking.status)) {
    throw new HttpsError('failed-precondition', 'Only paid bookings can be invoiced');
  }

  const total = Number(booking.totalAmount);
  const fee = Number(booking.processingFee) || 0;
  const service = Math.round((total - fee) * 100) / 100;
  const hours = Number(booking.duration) || 1;

  const invoice = {
    bookingId,
    clientId: booking.clientId,
    guardId: booking.guardId ?? null,
    transactionId: booking.transactionId ?? null,
    amount: total,
    currency: 'MXN',
    issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    items: [
      {
        description: 'Servicio de proteccion ejecutiva',
        quantity: hours,
        unitPrice: Math.round((service / hours) * 100) / 100,
        total: service,
      },
      { description: 'Cargo por procesamiento de pago', quantity: 1, unitPrice: fee, total: fee },
    ],
  };

  // Una factura por reserva: el id del documento es el bookingId.
  await admin.firestore().collection('invoices').doc(bookingId).set(invoice, { merge: true });
  return { invoiceId: bookingId, invoice: { ...invoice, issuedAt: new Date().toISOString() } };
});

export const recordUsageMetrics = onSchedule('every day 00:00', async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    await admin.firestore().collection('usage_metrics').add({
      date: dateStr,
      reads: 0,
      writes: 0,
      deletes: 0,
      storageBytes: 0,
      bandwidthBytes: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[RecordUsageMetrics] Error:', error);
  }
});

// createDemoUsers y createMissingDemoUser se eliminaron: cualquier usuario
// autenticado podia llamarlas y darse rol admin (o crear cuentas admin con
// contrasena propia) mientras BRAINTREE_ENV no fuera 'production'.

/**
 * Reset Demo Account Passwords
 * Resets all demo account passwords to known values
 * ✅ SECURITY: Protected - only works in sandbox mode
 */
export const resetDemoPasswords = onCall(async (request: CallableRequest) => {
  // Falla cerrado. Antes la puerta era `BRAINTREE_ENV !== 'production'`, y como
  // el entorno real esta en 'sandbox', la condicion estaba abierta de par en par.
  // Ahora hay que encender el interruptor a proposito.
  if (process.env.PERMITIR_RESET_DEMO !== 'true') {
    throw new HttpsError('permission-denied', 'El reseteo de cuentas demo esta desactivado');
  }

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Solo un administrador. Antes bastaba con estar autenticado: cualquiera que
  // se registrara con el boton "Create Account" podia llamar a esta funcion,
  // devolver admin@demo.com a su contrasena publica y entrar como
  // administrador. Cambiar las contrasenas en la consola no cerraba ese hueco,
  // porque esta funcion las volvia a poner.
  const perfilQuienLlama = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  if (perfilQuienLlama.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo un administrador puede resetear las cuentas demo');
  }
  
  try {
    // Las contrasenas salen del entorno de la funcion, nunca del codigo. Antes
    // estaban escritas aqui, en un repositorio publico, y esta misma funcion
    // las volvia a poner despues de cambiarlas en la consola.
    // Se configuran con: firebase functions:config o variables de entorno.
    const clave = (nombre: string): string | null => {
      const v = process.env[nombre];
      return v && v.length >= 12 ? v : null;
    };
    const demoAccounts = [
      { email: 'client@demo.com', password: clave('DEMO_PASS_CLIENT') },
      { email: 'admin@demo.com', password: clave('DEMO_PASS_ADMIN') },
      { email: 'company@demo.com', password: clave('DEMO_PASS_COMPANY') },
      { email: 'bodyguard@demo.com', password: clave('DEMO_PASS_GUARD') },
      { email: 'guard1@demo.com', password: clave('DEMO_PASS_GUARD') },
      { email: 'guard2@demo.com', password: clave('DEMO_PASS_GUARD') }
    ].filter((c): c is { email: string; password: string } => c.password !== null);

    if (demoAccounts.length === 0) {
      throw new HttpsError('failed-precondition',
        'No hay contrasenas demo configuradas en el entorno (DEMO_PASS_*, minimo 12 caracteres)');
    }

    console.log('[ResetDemoPasswords] Starting password reset for all demo accounts');
    const results: any[] = [];

    for (const account of demoAccounts) {
      try {
        // Get user by email
        const userRecord = await admin.auth().getUserByEmail(account.email);
        
        // Update password and ensure email is verified
        await admin.auth().updateUser(userRecord.uid, {
          password: account.password,
          emailVerified: true
        });

        console.log(`[ResetDemoPasswords] Successfully reset password for ${account.email}`);
        results.push({
          email: account.email,
          success: true,
          uid: userRecord.uid
        });
      } catch (error: any) {
        console.error(`[ResetDemoPasswords] Failed to reset ${account.email}:`, error);
        results.push({
          email: account.email,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[ResetDemoPasswords] Completed: ${successCount}/${demoAccounts.length} successful`);

    return {
      success: true,
      results,
      totalProcessed: demoAccounts.length,
      successfulResets: successCount
    };
  } catch (error: any) {
    console.error('[ResetDemoPasswords] Error:', error);
    throw new HttpsError('internal', error.message);
  }
});


interface NuevoEscoltaInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  hourlyRate?: number;
  language?: string;
}

interface ResultadoEscoltaCreado {
  email: string;
  success: boolean;
  uid?: string;
  error?: string;
}

/**
 * Crea una o varias cuentas de escolta para la empresa que llama. Sirve tanto
 * al alta uno-por-uno como a la importacion masiva por CSV: ambas mandan un
 * arreglo, uno con un solo elemento.
 *
 * Existe porque el SDK de cliente no puede crear cuentas de Firebase Auth
 * para otra persona (solo un admin.auth().createUser() del lado del
 * servidor puede) — antes de esto, "Invite" y la importacion CSV en
 * company-guards.tsx solo mostraban un Alert de exito sin crear nada.
 *
 * No manda correo desde aqui: el Admin SDK no envia el email de
 * restablecer-contrasena, solo el SDK de cliente lo hace (gratis, con la
 * plantilla que ya trae Firebase Auth). El cliente llama a
 * sendPasswordResetEmail() por cada cuenta creada con exito.
 */
export const createCompanyGuards = onCall({ invoker: 'public', ingressSettings: 'ALLOW_ALL' }, async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const perfilQuienLlama = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  if (perfilQuienLlama.data()?.role !== 'company') {
    throw new HttpsError('permission-denied', 'Solo una cuenta de empresa puede dar de alta escoltas');
  }
  const companyId = request.auth.uid;

  const guards: NuevoEscoltaInput[] = Array.isArray(request.data?.guards) ? request.data.guards : [];
  if (guards.length === 0) {
    throw new HttpsError('invalid-argument', 'No guards provided');
  }
  if (guards.length > 100) {
    throw new HttpsError('invalid-argument', 'Maximum 100 guards per import');
  }

  const results: ResultadoEscoltaCreado[] = [];
  const now = new Date().toISOString();

  for (const raw of guards) {
    const email = raw.email?.trim().toLowerCase();
    const firstName = raw.firstName?.trim();
    const lastName = raw.lastName?.trim();
    const phone = raw.phone?.trim();
    const hourlyRate = Number(raw.hourlyRate);

    if (!email || !firstName || !lastName || !phone || !Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      results.push({ email: email || '(sin email)', success: false, error: 'Missing or invalid required field' });
      continue;
    }

    try {
      // Contrasena temporal e inutilizable: nadie la ve ni la necesita, el
      // escolta entra por primera vez con el correo de restablecer que manda
      // el cliente justo despues de que esta funcion responde.
      const tempPassword = admin.firestore().collection('_').doc().id + 'Aa1!';

      const userRecord = await admin.auth().createUser({
        email,
        password: tempPassword,
        emailVerified: false,
        displayName: `${firstName} ${lastName}`,
        disabled: false,
      });

      const guardDoc = {
        email,
        role: 'guard',
        firstName,
        lastName,
        phone,
        language: raw.language || 'es',
        kycStatus: 'pending',
        createdAt: now,
        isActive: true,
        emailVerified: false,
        updatedAt: now,
        bio: '',
        height: 0,
        weight: 0,
        languages: [raw.language || 'es'],
        hourlyRate,
        photos: [],
        outfitPhotos: [],
        // Las URLs de documentos KYC ya no van en el perfil publico: viven
        // en users/{uid}/private/kyc (CONTRACT §5).
        certifications: [],
        rating: 0,
        completedJobs: 0,
        isFreelancer: false,
        companyId,
        availability: false,
      };

      await admin.firestore().collection('users').doc(userRecord.uid).set(guardDoc);

      results.push({ email, success: true, uid: userRecord.uid });
    } catch (error: any) {
      const message = error.code === 'auth/email-already-exists'
        ? 'An account with this email already exists'
        : error.message || 'Unknown error';
      results.push({ email, success: false, error: message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[CreateCompanyGuards] company=${companyId} created ${successCount}/${guards.length}`);

  return { results, successCount, totalProcessed: guards.length };
});

// Avisos en tiempo real por cambio de estado de una reserva (RTDB), cola de
// avisos push y emergencias. Solo llaman a admin.* dentro de cada funcion.
export { avisarCambioDeReserva, enviarAvisoEncolado, avisarEmergencia } from './notificaciones';
export { espejarRolARealtimeDB, backfillRoleMirrors } from './syncUserRole';
export { recalcularReputacionEscolta } from './reviews';
