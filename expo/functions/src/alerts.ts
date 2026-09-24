/**
 * Avisos generados por el SERVIDOR (webhooks, pagos). Van a la cola
 * `notifications` con senderId 'system' y status 'pending', para que
 * `enviarAvisoEncolado` los entregue por push.
 *
 * senderId 'system' es la marca de confianza: las reglas de Firestore exigen
 * senderId == request.auth.uid a cualquier cliente, y ningun uid de Firebase
 * Auth es 'system', asi que solo el Admin SDK puede escribirla. Solo en estos
 * avisos se respeta el titulo/cuerpo tal cual; los de clientes se arman con
 * plantilla (ver notificaciones.ts).
 */
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

export const SYSTEM_SENDER = 'system';

export interface ServerNotice {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

function noticeDoc(userId: string, notice: ServerNotice) {
  return {
    userId,
    senderId: SYSTEM_SENDER,
    type: notice.type,
    ...(notice.severity ? { severity: notice.severity } : {}),
    title: notice.title,
    body: notice.body,
    data: notice.data ?? {},
    status: 'pending',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function sendUserNotification(userId: string, notice: ServerNotice): Promise<void> {
  try {
    await admin.firestore().collection('notifications').add(noticeDoc(userId, notice));
  } catch (error) {
    logger.error('Failed to queue user notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      type: notice.type,
    });
  }
}

export async function sendAdminAlert(notice: ServerNotice & { severity: 'low' | 'medium' | 'high' | 'critical' }): Promise<void> {
  try {
    const db = admin.firestore();
    const admins = await db.collection('users').where('role', '==', 'admin').get();
    if (admins.empty) {
      logger.error('Admin alert with no admin recipients', { type: notice.type });
      return;
    }
    const batch = db.batch();
    admins.forEach((adminDoc) => batch.set(db.collection('notifications').doc(), noticeDoc(adminDoc.id, notice)));
    await batch.commit();
    logger.info('Admin alerts queued', { type: notice.type, severity: notice.severity, adminCount: admins.size });
  } catch (error) {
    logger.error('Failed to queue admin alert', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: notice.type,
    });
  }
}
