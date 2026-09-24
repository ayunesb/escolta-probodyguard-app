/**
 * Braintree Webhook Handlers
 * Reference: https://developer.paypal.com/braintree/docs/guides/webhooks
 *
 * Todas las escrituras usan set(..., { merge: true }): un webhook puede
 * llegar antes (o sin) el documento que "actualiza", y update() sobre un
 * documento inexistente lanza NOT_FOUND, el handler falla, Braintree
 * reintenta y el evento nunca se registra.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { sendAdminAlert, sendUserNotification } from '../alerts';

const getDb = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function handleSubscriptionChargedSuccessfully(notification: any): Promise<void> {
  const subscription = notification.subscription;
  const subscriptionId = subscription?.id;
  try {
    const db = getDb();
    logger.info('Processing subscription charge success', { subscriptionId });

    await db.collection('subscriptions').doc(subscriptionId).set({
      status: 'active',
      lastChargedAt: now(),
      lastChargedAmount: subscription.price,
      nextBillingDate: subscription.nextBillingDate,
      billingPeriodStartDate: subscription.billingPeriodStartDate,
      billingPeriodEndDate: subscription.billingPeriodEndDate,
      updatedAt: now(),
    }, { merge: true });

    if (subscription.transactions && subscription.transactions.length > 0) {
      const transaction = subscription.transactions[0];
      await db.collection('payment_transactions').doc(transaction.id).set({
        subscriptionId,
        amount: transaction.amount,
        status: transaction.status,
        type: 'subscription_charge',
        createdAt: now(),
      }, { merge: true });
    }
  } catch (error) {
    logger.error('Failed to handle subscription charged successfully', { error: errorMessage(error), subscriptionId });
    throw error;
  }
}

export async function handleSubscriptionChargedUnsuccessfully(notification: any): Promise<void> {
  const subscriptionId = notification.subscription?.id;
  try {
    const db = getDb();
    logger.warn('Subscription charge failed', { subscriptionId });

    await db.collection('subscriptions').doc(subscriptionId).set({
      status: 'past_due',
      lastChargeAttempt: now(),
      failureCount: admin.firestore.FieldValue.increment(1),
      updatedAt: now(),
    }, { merge: true });

    const subscriptionDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    const userId = subscriptionDoc.data()?.userId;
    if (userId) {
      await sendUserNotification(userId, {
        type: 'payment_failed',
        title: 'Pago fallido',
        body: 'No se pudo cobrar tu suscripcion. Actualiza tu metodo de pago.',
        data: { subscriptionId },
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription charged unsuccessfully', { error: errorMessage(error), subscriptionId });
    throw error;
  }
}

export async function handleSubscriptionCanceled(notification: any): Promise<void> {
  const subscriptionId = notification.subscription?.id;
  try {
    await getDb().collection('subscriptions').doc(subscriptionId).set({
      status: 'canceled',
      canceledAt: now(),
      updatedAt: now(),
    }, { merge: true });
  } catch (error) {
    logger.error('Failed to handle subscription canceled', { error: errorMessage(error), subscriptionId });
    throw error;
  }
}

export async function handleSubscriptionExpired(notification: any): Promise<void> {
  const subscriptionId = notification.subscription?.id;
  try {
    const db = getDb();
    await db.collection('subscriptions').doc(subscriptionId).set({
      status: 'expired',
      expiredAt: now(),
      updatedAt: now(),
    }, { merge: true });

    const subscriptionDoc = await db.collection('subscriptions').doc(subscriptionId).get();
    const userId = subscriptionDoc.data()?.userId;
    if (userId) {
      await sendUserNotification(userId, {
        type: 'subscription_expired',
        title: 'Suscripcion vencida',
        body: 'Tu suscripcion vencio. Renuevala para seguir usando el servicio.',
        data: { subscriptionId },
      });
    }
  } catch (error) {
    logger.error('Failed to handle subscription expired', { error: errorMessage(error), subscriptionId });
    throw error;
  }
}

export async function handleDisputeOpened(notification: any): Promise<void> {
  const dispute = notification.dispute;
  const disputeId = dispute?.id;
  const transactionId = dispute?.transaction?.id;
  try {
    const db = getDb();
    logger.warn('CRITICAL: Dispute opened', { disputeId, transactionId });

    await db.collection('disputes').doc(disputeId).set({
      transactionId: transactionId ?? null,
      status: 'open',
      amount: dispute.amount ?? null,
      amountWon: dispute.amountWon ?? null,
      amountDisputed: dispute.amountDisputed ?? null,
      reason: dispute.reason ?? null,
      reasonCode: dispute.reasonCode ?? null,
      kind: dispute.kind ?? null,
      receivedDate: dispute.receivedDate ?? null,
      replyByDate: dispute.replyByDate ?? null,
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });

    if (transactionId) {
      await db.collection('payment_transactions').doc(transactionId).set({
        disputeStatus: 'open',
        disputeId,
        updatedAt: now(),
      }, { merge: true });
    }

    await sendAdminAlert({
      type: 'dispute_opened',
      severity: 'high',
      title: 'Disputa de pago abierta',
      body: `Disputa ${disputeId} sobre ${transactionId}. Monto: $${dispute.amount} MXN. Motivo: ${dispute.reason}. Responder antes de: ${dispute.replyByDate}`,
      data: { disputeId, transactionId, amount: dispute.amount },
    });
  } catch (error) {
    logger.error('Failed to handle dispute opened', { error: errorMessage(error), disputeId });
    throw error;
  }
}

async function closeDispute(notification: any, status: 'won' | 'lost'): Promise<void> {
  const dispute = notification.dispute;
  const disputeId = dispute?.id;
  const db = getDb();
  await db.collection('disputes').doc(disputeId).set({
    status,
    closedAt: now(),
    updatedAt: now(),
  }, { merge: true });

  if (dispute?.transaction?.id) {
    await db.collection('payment_transactions').doc(dispute.transaction.id).set({
      disputeStatus: status,
      updatedAt: now(),
    }, { merge: true });
  }
}

export async function handleDisputeLost(notification: any): Promise<void> {
  const disputeId = notification.dispute?.id;
  try {
    await closeDispute(notification, 'lost');
    await sendAdminAlert({
      type: 'dispute_lost',
      severity: 'high',
      title: 'Disputa perdida',
      body: `Disputa ${disputeId}. Monto perdido: $${notification.dispute?.amount} MXN`,
      data: { disputeId },
    });
  } catch (error) {
    logger.error('Failed to handle dispute lost', { error: errorMessage(error), disputeId });
    throw error;
  }
}

export async function handleDisputeWon(notification: any): Promise<void> {
  const disputeId = notification.dispute?.id;
  try {
    await closeDispute(notification, 'won');
    await sendAdminAlert({
      type: 'dispute_won',
      severity: 'low',
      title: 'Disputa ganada',
      body: `Disputa ${disputeId}. Monto recuperado: $${notification.dispute?.amountWon} MXN`,
      data: { disputeId },
    });
  } catch (error) {
    logger.error('Failed to handle dispute won', { error: errorMessage(error), disputeId });
    throw error;
  }
}

export async function handleTransactionSettled(notification: any): Promise<void> {
  const transaction = notification.transaction;
  if (!transaction?.id) {
    logger.warn('Transaction settled event missing transaction data');
    return;
  }
  try {
    await getDb().collection('payment_transactions').doc(transaction.id).set({
      status: 'settled',
      settledAt: now(),
      settlementAmount: transaction.amount ?? null,
      orderId: transaction.orderId ?? null,
      updatedAt: now(),
    }, { merge: true });
  } catch (error) {
    logger.error('Failed to handle transaction settled', { error: errorMessage(error), transactionId: transaction.id });
    throw error;
  }
}

export async function handleTransactionSettlementDeclined(notification: any): Promise<void> {
  const transaction = notification.transaction;
  if (!transaction?.id) {
    logger.warn('Transaction settlement declined event missing transaction data');
    return;
  }
  try {
    await getDb().collection('payment_transactions').doc(transaction.id).set({
      status: 'settlement_declined',
      settlementDeclinedAt: now(),
      orderId: transaction.orderId ?? null,
      updatedAt: now(),
    }, { merge: true });

    // orderId es el bookingId (ver processBookingPayment). La reserva ya
    // estaba confirmada: el administrador decide si la cancela.
    await sendAdminAlert({
      type: 'settlement_declined',
      severity: 'high',
      title: 'Liquidacion rechazada',
      body: `La transaccion ${transaction.id} (reserva ${transaction.orderId ?? 'desconocida'}) fue rechazada al liquidar. Monto: $${transaction.amount} MXN`,
      data: { transactionId: transaction.id, bookingId: transaction.orderId ?? null },
    });
  } catch (error) {
    logger.error('Failed to handle transaction settlement declined', { error: errorMessage(error), transactionId: transaction.id });
    throw error;
  }
}

/**
 * Un "disbursement" de Braintree es la liquidacion de Braintree a la cuenta
 * bancaria de la PLATAFORMA, no el pago a un escolta. Antes se guardaba en
 * `payouts` (la coleccion de pagos a escoltas) con status 'completed' y sin
 * guardId. Ahora va a su propia coleccion.
 */
export async function handleDisbursement(notification: any): Promise<void> {
  const disbursement = notification.disbursement;
  const disbursementId = disbursement?.id;
  try {
    const db = getDb();
    await db.collection('disbursements').doc(disbursementId).set({
      merchantAccountId: disbursement.merchantAccount?.id ?? null,
      amount: disbursement.amount ?? null,
      status: 'completed',
      disbursementDate: disbursement.disbursementDate ?? null,
      exceptionMessage: disbursement.exceptionMessage || null,
      followUpAction: disbursement.followUpAction || null,
      transactionIds: disbursement.transactionIds || [],
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });

    const ids: string[] = disbursement.transactionIds || [];
    if (ids.length > 0) {
      const batch = db.batch();
      for (const txId of ids) {
        batch.set(db.collection('payment_transactions').doc(txId), {
          disbursementId,
          disbursementStatus: 'completed',
          disbursedAt: now(),
        }, { merge: true });
      }
      await batch.commit();
    }
  } catch (error) {
    logger.error('Failed to handle disbursement', { error: errorMessage(error), disbursementId });
    throw error;
  }
}

export async function handleDisbursementException(notification: any): Promise<void> {
  const disbursement = notification.disbursement;
  const disbursementId = disbursement?.id;
  try {
    const db = getDb();
    await db.collection('disbursements').doc(disbursementId).set({
      merchantAccountId: disbursement.merchantAccount?.id ?? null,
      amount: disbursement.amount ?? null,
      status: 'failed',
      disbursementDate: disbursement.disbursementDate ?? null,
      exceptionMessage: disbursement.exceptionMessage ?? null,
      followUpAction: disbursement.followUpAction ?? null,
      transactionIds: disbursement.transactionIds || [],
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });

    const ids: string[] = disbursement.transactionIds || [];
    if (ids.length > 0) {
      const batch = db.batch();
      for (const txId of ids) {
        batch.set(db.collection('payment_transactions').doc(txId), {
          disbursementId,
          disbursementStatus: 'failed',
          disbursementError: disbursement.exceptionMessage ?? null,
        }, { merge: true });
      }
      await batch.commit();
    }

    await sendAdminAlert({
      type: 'disbursement_exception',
      severity: 'critical',
      title: 'Liquidacion de Braintree fallida',
      body: `Liquidacion ${disbursementId}: $${disbursement.amount} MXN. Motivo: ${disbursement.exceptionMessage}. Accion: ${disbursement.followUpAction}`,
      data: {
        disbursementId,
        exceptionMessage: disbursement.exceptionMessage ?? null,
        followUpAction: disbursement.followUpAction ?? null,
      },
    });
  } catch (error) {
    logger.error('Failed to handle disbursement exception', { error: errorMessage(error), disbursementId });
    throw error;
  }
}
