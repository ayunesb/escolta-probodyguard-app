/**
 * Reputacion del escolta. Es el UNICO escritor de `rating`, `ratingBreakdown`,
 * `reviewCount` y `completedJobs` en users/{guardId}: las reglas de Firestore
 * ya no dejan que el dueno (ni nadie salvo admin) toque esos campos.
 *
 * Se dispara con cada resena nueva y recalcula todo desde cero, asi que es
 * idempotente y se corrige solo si alguna vez se pierde un disparo.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const BREAKDOWN_KEYS = ['professionalism', 'punctuality', 'communication', 'languageClarity'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Una resena cuenta solo si la reserva existe en RTDB, esta terminada y es
 * de ese cliente con ese escolta. Las reglas ya lo exigen via
 * bookingParticipants; esto es la segunda barrera, del lado del servidor.
 */
async function reviewIsGenuine(review: FirebaseFirestore.DocumentData): Promise<string | null> {
  if (typeof review.bookingId !== 'string' || !review.bookingId) return 'missing bookingId';
  const booking = (await admin.database().ref(`bookings/${review.bookingId}`).get()).val();
  if (!booking) return 'booking not found';
  if (booking.clientId !== review.clientId) return 'client mismatch';
  if (booking.guardId !== review.guardId) return 'guard mismatch';
  if (booking.status !== 'completed') return 'booking not completed';
  return null;
}

async function countCompletedJobs(guardId: string): Promise<number> {
  const index = (await admin.database().ref(`guardBookingIndex/${guardId}`).get()).val() as Record<string, unknown> | null;
  if (!index) return 0;
  const results = await Promise.all(
    Object.keys(index).map(async (bookingId) => {
      const snap = await admin.database().ref(`bookings/${bookingId}`).get();
      const b = snap.val();
      return b && b.guardId === guardId && b.status === 'completed' ? 1 : 0;
    })
  );
  return results.reduce<number>((a, b) => a + b, 0);
}

export async function recomputeGuardReputation(guardId: string): Promise<void> {
  const db = admin.firestore();
  const snap = await db.collection('reviews').where('guardId', '==', guardId).get();

  // Una resena por reserva: si hay varias, cuenta la primera.
  const byBooking = new Map<string, FirebaseFirestore.DocumentData>();
  snap.docs
    .map((d) => d.data())
    .filter((r) => r.excluded !== true && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    .forEach((r) => {
      if (typeof r.bookingId === 'string' && !byBooking.has(r.bookingId)) byBooking.set(r.bookingId, r);
    });

  const reviews = Array.from(byBooking.values());
  const reviewCount = reviews.length;
  const rating = reviewCount ? round2(reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) : 0;

  const ratingBreakdown: Record<string, number> = {};
  for (const key of BREAKDOWN_KEYS) {
    const values = reviews
      .map((r) => Number(r.ratingBreakdown?.[key]))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
    ratingBreakdown[key] = values.length ? round2(values.reduce((s, v) => s + v, 0) / values.length) : 0;
  }

  const completedJobs = await countCompletedJobs(guardId);

  await db.doc(`users/${guardId}`).set(
    { rating, reviewCount, ratingBreakdown, completedJobs, reputationUpdatedAt: new Date().toISOString() },
    { merge: true }
  );
}

export const recalcularReputacionEscolta = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const review = event.data?.data();
  if (!review || typeof review.guardId !== 'string' || !review.guardId) return;

  const problem = await reviewIsGenuine(review);
  if (problem) {
    console.warn('[Reputacion] Resena excluida:', event.params.reviewId, problem);
    await event.data!.ref.set({ excluded: true, excludedReason: problem }, { merge: true });
  }

  await recomputeGuardReputation(review.guardId);
});
