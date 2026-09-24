import { db as getDbInstance } from '@/lib/firebase';
import {
  addDoc,
  collection,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  QueryDocumentSnapshot,
  Timestamp,
  where,
} from 'firebase/firestore';
import { monitoringService } from './monitoringService';
import { logger } from '@/utils/logger';

export type KYCAuditAction = 'upload' | 'review' | 'approve' | 'reject' | 'delete';

export interface KYCAuditEntry {
  id?: string;
  userId: string;
  documentId: string;
  action: KYCAuditAction;
  reviewerId?: string;
  reviewerRole?: string;
  previousStatus?: string;
  newStatus?: string;
  notes?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

const COLLECTION = 'kyc_audit_log';

// Firestore rechaza `undefined`: se quitan antes de escribir.
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function fromDoc(snap: QueryDocumentSnapshot): KYCAuditEntry {
  const data = snap.data();
  const ts = data.timestamp;
  return {
    id: snap.id,
    userId: data.userId ?? '',
    documentId: data.documentId ?? '',
    action: data.action,
    reviewerId: data.reviewerId,
    reviewerRole: data.reviewerRole,
    previousStatus: data.previousStatus,
    newStatus: data.newStatus,
    notes: data.notes,
    metadata: data.metadata || {},
    timestamp: ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts ?? 0),
  };
}

class KYCAuditService {
  private async write(entry: Omit<KYCAuditEntry, 'timestamp' | 'id'>): Promise<void> {
    await addDoc(
      collection(getDbInstance(), COLLECTION),
      compact({ ...entry, timestamp: Timestamp.fromDate(new Date()) })
    );
  }

  async logDocumentUpload(
    userId: string,
    documentId: string,
    documentType: string,
    fileHash: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.write({
        userId,
        documentId,
        action: 'upload',
        metadata: compact({ documentType, fileHash, ...metadata }),
      });
      await monitoringService.log('info', 'KYC document uploaded', { userId, documentId, documentType }, userId);
    } catch (error) {
      logger.error('[KYCAudit] Failed to log document upload', error);
    }
  }

  async logDocumentReview(
    userId: string,
    documentId: string,
    reviewerId: string,
    reviewerRole: string,
    action: 'approve' | 'reject',
    previousStatus: string,
    newStatus: string,
    notes?: string
  ): Promise<void> {
    try {
      await this.write({
        userId,
        documentId,
        action,
        reviewerId,
        reviewerRole,
        previousStatus,
        newStatus,
        notes,
        metadata: {},
      });
      await monitoringService.log('info', `KYC ${action}`, { userId, documentId, reviewerId, reviewerRole }, reviewerId);
    } catch (error) {
      logger.error('[KYCAudit] Failed to log document review', error);
    }
  }

  async logDocumentDeletion(userId: string, documentId: string, deletedBy: string, reason?: string): Promise<void> {
    try {
      await this.write({
        userId,
        documentId,
        action: 'delete',
        reviewerId: deletedBy,
        notes: reason,
        metadata: {},
      });
    } catch (error) {
      logger.error('[KYCAudit] Failed to log document deletion', error);
    }
  }

  // Entradas desde una fecha, mas recientes primero. Con cota inferior y
  // limite: nunca lee la coleccion completa. Lanza si falla (solo admin).
  async getEntriesSince(since: Date, max = 300): Promise<KYCAuditEntry[]> {
    const q = query(
      collection(getDbInstance(), COLLECTION),
      where('timestamp', '>=', Timestamp.fromDate(since)),
      orderBy('timestamp', 'desc'),
      limitTo(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromDoc);
  }

  async getAuditTrail(userId: string): Promise<KYCAuditEntry[]> {
    try {
      const q = query(
        collection(getDbInstance(), COLLECTION),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(fromDoc);
    } catch (error) {
      logger.error('[KYCAudit] Failed to get audit trail', error);
      return [];
    }
  }

  async generateComplianceReport(startDate: Date, endDate: Date): Promise<{
    totalUploads: number;
    totalReviews: number;
    totalApprovals: number;
    totalRejections: number;
    reviewerStats: Record<string, { approvals: number; rejections: number }>;
  }> {
    const report = {
      totalUploads: 0,
      totalReviews: 0,
      totalApprovals: 0,
      totalRejections: 0,
      reviewerStats: {} as Record<string, { approvals: number; rejections: number }>,
    };
    try {
      const entries = await this.getEntriesSince(startDate, 2000);
      entries
        .filter((e) => e.timestamp <= endDate)
        .forEach((e) => {
          if (e.action === 'upload') report.totalUploads++;
          if (e.action === 'review') report.totalReviews++;
          if (e.action === 'approve' || e.action === 'reject') {
            if (e.action === 'approve') report.totalApprovals++;
            else report.totalRejections++;
            if (e.reviewerId) {
              const s = (report.reviewerStats[e.reviewerId] ??= { approvals: 0, rejections: 0 });
              if (e.action === 'approve') s.approvals++;
              else s.rejections++;
            }
          }
        });
    } catch (error) {
      logger.error('[KYCAudit] Failed to generate compliance report', error);
    }
    return report;
  }
}

export const kycAuditService = new KYCAuditService();
