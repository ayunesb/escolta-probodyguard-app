import i18n from '@/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db as getDbInstance } from '@/lib/firebase';

const RATE_LIMIT_PREFIX = '@rate_limit_';

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: {
    maxAttempts: __DEV__ ? 50 : 5,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: __DEV__ ? 5 * 60 * 1000 : 30 * 60 * 1000,
  },
  startCode: {
    maxAttempts: __DEV__ ? 20 : 3,
    windowMs: 5 * 60 * 1000,
    blockDurationMs: __DEV__ ? 60 * 1000 : 15 * 60 * 1000,
  },
  chat: {
    maxAttempts: __DEV__ ? 100 : 30,
    windowMs: 60 * 1000,
    blockDurationMs: 5 * 60 * 1000,
  },
  booking: {
    maxAttempts: __DEV__ ? 100 : 10,
    windowMs: __DEV__ ? 60 * 1000 : 60 * 60 * 1000,
    blockDurationMs: __DEV__ ? 60 * 1000 : 60 * 60 * 1000,
  },
};

interface RateLimitRecord {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}

export const rateLimitService = {
  async checkRateLimit(
    action: keyof typeof RATE_LIMITS,
    identifier: string
  ): Promise<{ allowed: boolean; remainingAttempts?: number; blockedUntil?: number }> {
    try {
      const config = RATE_LIMITS[action];
      const key = `${RATE_LIMIT_PREFIX}${action}_${identifier}`;
      
      const stored = await AsyncStorage.getItem(key);
      const now = Date.now();
      
      if (!stored) {
        await this.recordAttempt(action, identifier);
        return { allowed: true, remainingAttempts: config.maxAttempts - 1 };
      }
      
      const record: RateLimitRecord = JSON.parse(stored);
      
      if (record.blockedUntil && record.blockedUntil > now) {
        console.log(`[RateLimit] ${action} blocked for ${identifier} until ${new Date(record.blockedUntil).toISOString()}`);
        return { allowed: false, blockedUntil: record.blockedUntil };
      }
      
      if (now - record.firstAttempt > config.windowMs) {
        await AsyncStorage.removeItem(key);
        await this.recordAttempt(action, identifier);
        return { allowed: true, remainingAttempts: config.maxAttempts - 1 };
      }
      
      if (record.attempts >= config.maxAttempts) {
        const blockedUntil = now + config.blockDurationMs;
        record.blockedUntil = blockedUntil;
        await AsyncStorage.setItem(key, JSON.stringify(record));
        
        await this.logRateLimitViolation(action, identifier, record.attempts);
        
        console.log(`[RateLimit] ${action} limit exceeded for ${identifier}, blocked until ${new Date(blockedUntil).toISOString()}`);
        return { allowed: false, blockedUntil };
      }
      
      await this.recordAttempt(action, identifier);
      return { allowed: true, remainingAttempts: config.maxAttempts - record.attempts - 1 };
    } catch (error) {
      console.error('[RateLimit] Error checking rate limit:', error);
      return { allowed: true };
    }
  },
  
  async recordAttempt(action: keyof typeof RATE_LIMITS, identifier: string): Promise<void> {
    try {
      const key = `${RATE_LIMIT_PREFIX}${action}_${identifier}`;
      const stored = await AsyncStorage.getItem(key);
      const now = Date.now();
      
      if (!stored) {
        const record: RateLimitRecord = {
          attempts: 1,
          firstAttempt: now,
        };
        await AsyncStorage.setItem(key, JSON.stringify(record));
      } else {
        const record: RateLimitRecord = JSON.parse(stored);
        record.attempts += 1;
        await AsyncStorage.setItem(key, JSON.stringify(record));
      }
      
      console.log(`[RateLimit] Recorded ${action} attempt for ${identifier}`);
    } catch (error) {
      console.error('[RateLimit] Error recording attempt:', error);
    }
  },
  
  async resetRateLimit(action: keyof typeof RATE_LIMITS, identifier: string): Promise<void> {
    try {
      const key = `${RATE_LIMIT_PREFIX}${action}_${identifier}`;
      await AsyncStorage.removeItem(key);
      console.log(`[RateLimit] Reset ${action} for ${identifier}`);
    } catch (error) {
      console.error('[RateLimit] Error resetting rate limit:', error);
    }
  },
  
  async logRateLimitViolation(
    action: string,
    identifier: string,
    attempts: number
  ): Promise<void> {
    try {
      const violationRef = doc(getDbInstance(), 'rateLimitViolations', `${action}_${identifier}_${Date.now()}`);
      await setDoc(violationRef, {
        action,
        identifier,
        attempts,
        timestamp: serverTimestamp(),
      });
      console.log(`[RateLimit] Logged violation: ${action} for ${identifier}`);
    } catch (error) {
      console.error('[RateLimit] Error logging violation:', error);
    }
  },
  
  getRateLimitError(action: keyof typeof RATE_LIMITS, blockedUntil: number): string {
    const minutes = Math.ceil((blockedUntil - Date.now()) / 60000);
    
    const key = action === 'login' || action === 'startCode' || action === 'chat' || action === 'booking' ? action : 'generic';
    return i18n.t(`auth:rateLimit.${key}`, { count: minutes });
  },
};
