import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { logger } from '@/utils/logger';

export interface ConsentRecord {
  userId: string;
  termsOfService: boolean;
  privacyPolicy: boolean;
  dataProcessing: boolean;
  marketing: boolean;
  analytics: boolean;
  locationTracking: boolean;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  version: string;
}

export interface ConsentUpdate {
  marketing?: boolean;
  analytics?: boolean;
  locationTracking?: boolean;
}

// consents/{uid}: preferencias de consentimiento del titular (LFPDPPP).
// Requiere una regla de Firestore que deje leer/escribir al dueno.
class ConsentService {
  private readonly CURRENT_VERSION = '1.0.0';
  private readonly COLLECTION = 'consents';

  async recordConsent(
    userId: string,
    consents: Omit<ConsentRecord, 'userId' | 'timestamp' | 'version'>,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    try {
      await setDoc(doc(db(), this.COLLECTION, userId), {
        userId,
        ...consents,
        ...(metadata ?? {}),
        timestamp: serverTimestamp(),
        version: this.CURRENT_VERSION,
      });
    } catch (error) {
      logger.error('[Consent] Error recording consent', error);
      throw new Error('Failed to record consent');
    }
  }

  async getConsent(userId: string): Promise<ConsentRecord | null> {
    try {
      const consentDoc = await getDoc(doc(db(), this.COLLECTION, userId));
      if (!consentDoc.exists()) return null;
      const data = consentDoc.data();
      return {
        userId: data.userId,
        termsOfService: data.termsOfService === true,
        privacyPolicy: data.privacyPolicy === true,
        dataProcessing: data.dataProcessing === true,
        marketing: data.marketing === true,
        analytics: data.analytics === true,
        locationTracking: data.locationTracking === true,
        timestamp: data.timestamp?.toDate?.() || new Date(),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        version: data.version,
      };
    } catch (error) {
      logger.error('[Consent] Error getting consent', error);
      throw new Error('Failed to get consent');
    }
  }

  // Merge: funciona aunque el documento aun no exista (antes updateDoc
  // fallaba para cualquiera que nunca hubiera guardado preferencias).
  async updateConsent(userId: string, updates: ConsentUpdate): Promise<void> {
    try {
      await setDoc(
        doc(db(), this.COLLECTION, userId),
        { userId, ...updates, version: this.CURRENT_VERSION, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      logger.error('[Consent] Error updating consent', error);
      throw new Error('Failed to update consent');
    }
  }

  async hasValidConsent(userId: string): Promise<boolean> {
    try {
      const consent = await this.getConsent(userId);
      return !!consent && consent.termsOfService && consent.privacyPolicy && consent.dataProcessing;
    } catch {
      return false;
    }
  }

  async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    try {
      const historyDocs = await getDocs(query(collection(db(), `${this.COLLECTION}/${userId}/history`)));
      return historyDocs.docs.map((d) => {
        const data = d.data();
        return {
          userId: data.userId,
          termsOfService: data.termsOfService,
          privacyPolicy: data.privacyPolicy,
          dataProcessing: data.dataProcessing,
          marketing: data.marketing,
          analytics: data.analytics,
          locationTracking: data.locationTracking,
          timestamp: data.timestamp?.toDate?.() || new Date(),
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          version: data.version,
        };
      });
    } catch (error) {
      logger.error('[Consent] Error getting consent history', error);
      return [];
    }
  }

  async withdrawConsent(userId: string, consentType: keyof ConsentUpdate): Promise<void> {
    await this.updateConsent(userId, { [consentType]: false });
  }

  async archiveConsentToHistory(userId: string): Promise<void> {
    try {
      const currentConsent = await this.getConsent(userId);
      if (!currentConsent) return;
      await setDoc(doc(db(), `${this.COLLECTION}/${userId}/history`, Date.now().toString()), currentConsent);
    } catch (error) {
      logger.error('[Consent] Error archiving consent', error);
    }
  }
}

export const consentService = new ConsentService();
