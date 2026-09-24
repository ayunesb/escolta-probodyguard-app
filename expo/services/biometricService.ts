import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import i18n from '@/i18n';

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials';

export interface BiometricCredentials {
  email: string;
  encryptedPassword: string;
}

class BiometricService {
  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.log('[Biometric] Not available on web');
      return false;
    }

    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      console.log('[Biometric] Available:', compatible && enrolled);
      return compatible && enrolled;
    } catch (error) {
      console.error('[Biometric] Error checking availability:', error);
      return false;
    }
  }

  async getSupportedTypes(): Promise<string[]> {
    if (Platform.OS === 'web') return [];

    try {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const typeNames = types.map(type => {
        switch (type) {
          case LocalAuthentication.AuthenticationType.FINGERPRINT:
            return i18n.t('account:biometric.fingerprint');
          case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
            return i18n.t('account:biometric.faceId');
          case LocalAuthentication.AuthenticationType.IRIS:
            return i18n.t('account:biometric.iris');
          default:
            return i18n.t('account:biometric.generic');
        }
      });
      console.log('[Biometric] Supported types:', typeNames);
      return typeNames;
    } catch (error) {
      console.error('[Biometric] Error getting supported types:', error);
      return [];
    }
  }

  async authenticate(reason: string = i18n.t('account:biometric.authenticate')): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.log('[Biometric] Web fallback - skipping authentication');
      return true;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: i18n.t('common:actions.cancel'),
        disableDeviceFallback: false,
        fallbackLabel: i18n.t('account:biometric.usePasscode'),
      });

      console.log('[Biometric] Authentication result:', result.success);
      return result.success;
    } catch (error) {
      console.error('[Biometric] Authentication error:', error);
      return false;
    }
  }

  async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
      return enabled === 'true';
    } catch (error) {
      console.error('[Biometric] Error checking if enabled:', error);
      return false;
    }
  }

  async enableBiometric(email: string, password: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.log('[Biometric] Not available on web');
      return false;
    }

    try {
      const available = await this.isAvailable();
      if (!available) {
        console.log('[Biometric] Not available on device');
        return false;
      }

      const authenticated = await this.authenticate(i18n.t('account:biometric.enableLogin'));
      if (!authenticated) {
        console.log('[Biometric] Authentication failed');
        return false;
      }

      const credentials: BiometricCredentials = {
        email,
        encryptedPassword: this.simpleEncrypt(password),
      };

      await AsyncStorage.setItem(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify(credentials));
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
      
      console.log('[Biometric] Enabled successfully');
      return true;
    } catch (error) {
      console.error('[Biometric] Error enabling:', error);
      return false;
    }
  }

  async disableBiometric(): Promise<void> {
    try {
      await AsyncStorage.removeItem(BIOMETRIC_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
      console.log('[Biometric] Disabled successfully');
    } catch (error) {
      console.error('[Biometric] Error disabling:', error);
    }
  }

  async getStoredCredentials(): Promise<BiometricCredentials | null> {
    try {
      const credentialsStr = await AsyncStorage.getItem(BIOMETRIC_CREDENTIALS_KEY);
      if (!credentialsStr) return null;

      const credentials: BiometricCredentials = JSON.parse(credentialsStr);
      return {
        email: credentials.email,
        encryptedPassword: this.simpleDecrypt(credentials.encryptedPassword),
      };
    } catch (error) {
      console.error('[Biometric] Error getting credentials:', error);
      return null;
    }
  }

  private simpleEncrypt(text: string): string {
    if (Platform.OS === 'web') {
      return btoa(text);
    }
    return Buffer.from(text).toString('base64');
  }

  private simpleDecrypt(encrypted: string): string {
    if (Platform.OS === 'web') {
      return atob(encrypted);
    }
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  }
}

export const biometricService = new BiometricService();
