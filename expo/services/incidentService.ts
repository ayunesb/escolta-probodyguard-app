import { db as getDbInstance } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import i18n from '@/i18n';

export interface IncidentReport {
  id: string;
  bookingId: string;
  reportedBy: string;
  type: 'security' | 'medical' | 'property' | 'behavioral' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  timestamp: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  media: IncidentMedia[];
  witnesses?: string[];
  actions?: string[];
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface IncidentMedia {
  type: 'photo' | 'video';
  uri: string;
  timestamp: string;
  caption?: string;
}

class IncidentService {
  async createIncidentReport(
    bookingId: string,
    reportedBy: string,
    data: {
      type: IncidentReport['type'];
      severity: IncidentReport['severity'];
      title: string;
      description: string;
      location: IncidentReport['location'];
      media?: IncidentMedia[];
      witnesses?: string[];
    }
  ): Promise<{ success: boolean; reportId?: string; error?: string }> {
    try {
      console.log('[Incident] Creating incident report:', bookingId);

      const report: Omit<IncidentReport, 'id'> = {
        bookingId,
        reportedBy,
        type: data.type,
        severity: data.severity,
        title: data.title,
        description: data.description,
        location: data.location,
        timestamp: new Date().toISOString(),
        status: 'open',
        media: data.media || [],
        witnesses: data.witnesses,
        actions: [],
      };

      const docRef = await addDoc(collection(getDbInstance(), 'incidentReports'), report);
      console.log('[Incident] Report created:', docRef.id);

      return { success: true, reportId: docRef.id };
    } catch (error) {
      console.error('[Incident] Error creating report:', error);
      return { success: false, error: i18n.t('booking:errors.incidentFailed') };
    }
  }

  async updateIncidentReport(
    reportId: string,
    updates: Partial<IncidentReport>
  ): Promise<boolean> {
    try {
      console.log('[Incident] Updating report:', reportId);
      const { id, ...updateData } = updates;
      await updateDoc(doc(getDbInstance(), 'incidentReports', reportId), updateData);
      return true;
    } catch (error) {
      console.error('[Incident] Error updating report:', error);
      return false;
    }
  }

  async resolveIncident(
    reportId: string,
    resolution: string,
    resolvedBy: string
  ): Promise<boolean> {
    try {
      console.log('[Incident] Resolving incident:', reportId);

      await updateDoc(doc(getDbInstance(), 'incidentReports', reportId), {
        status: 'resolved',
        resolution,
        resolvedBy,
        resolvedAt: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      console.error('[Incident] Error resolving incident:', error);
      return false;
    }
  }

  async getIncidentReport(reportId: string): Promise<IncidentReport | null> {
    try {
      const docSnap = await getDoc(doc(getDbInstance(), 'incidentReports', reportId));
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as IncidentReport;
      }
      
      return null;
    } catch (error) {
      console.error('[Incident] Error getting report:', error);
      return null;
    }
  }

  async getBookingIncidents(bookingId: string): Promise<IncidentReport[]> {
    try {
      const q = query(
        collection(getDbInstance(), 'incidentReports'),
        where('bookingId', '==', bookingId),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
    } catch (error) {
      console.error('[Incident] Error getting booking incidents:', error);
      return [];
    }
  }

  async getUserIncidents(userId: string): Promise<IncidentReport[]> {
    try {
      const q = query(
        collection(getDbInstance(), 'incidentReports'),
        where('reportedBy', '==', userId),
        orderBy('timestamp', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
    } catch (error) {
      console.error('[Incident] Error getting user incidents:', error);
      return [];
    }
  }

  async pickImage(): Promise<IncidentMedia | null> {
    try {
      if (Platform.OS === 'web') {
        console.log('[Incident] Image picker not fully supported on web');
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        console.error('[Incident] Media library permission denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        return {
          type: asset.type === 'video' ? 'video' : 'photo',
          uri: asset.uri,
          timestamp: new Date().toISOString(),
        };
      }

      return null;
    } catch (error) {
      console.error('[Incident] Error picking image:', error);
      return null;
    }
  }

  async takePhoto(): Promise<IncidentMedia | null> {
    try {
      if (Platform.OS === 'web') {
        console.log('[Incident] Camera not fully supported on web');
        return null;
      }

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        console.error('[Incident] Camera permission denied');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        return {
          type: 'photo',
          uri: asset.uri,
          timestamp: new Date().toISOString(),
        };
      }

      return null;
    } catch (error) {
      console.error('[Incident] Error taking photo:', error);
      return null;
    }
  }

  async addMediaToReport(
    reportId: string,
    media: IncidentMedia
  ): Promise<boolean> {
    try {
      const report = await this.getIncidentReport(reportId);
      
      if (!report) {
        console.error('[Incident] Report not found');
        return false;
      }

      const updatedMedia = [...report.media, media];
      await updateDoc(doc(getDbInstance(), 'incidentReports', reportId), {
        media: updatedMedia,
      });

      console.log('[Incident] Media added to report:', reportId);
      return true;
    } catch (error) {
      console.error('[Incident] Error adding media:', error);
      return false;
    }
  }

  getSeverityColor(severity: IncidentReport['severity']): string {
    switch (severity) {
      case 'low':
        return '#10B981';
      case 'medium':
        return '#F59E0B';
      case 'high':
        return '#EF4444';
      case 'critical':
        return '#DC2626';
      default:
        return '#6B7280';
    }
  }

  getTypeIcon(type: IncidentReport['type']): string {
    switch (type) {
      case 'security':
        return '🛡️';
      case 'medical':
        return '🏥';
      case 'property':
        return '🏢';
      case 'behavioral':
        return '⚠️';
      case 'other':
        return '📋';
      default:
        return '📋';
    }
  }
}

export const incidentService = new IncidentService();
