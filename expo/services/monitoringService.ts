import { Platform } from 'react-native';
import { db as getDbInstance, auth as getAuthInstance } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

type LogLevel = 'info' | 'warn' | 'error' | 'critical';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  userId?: string;
  timestamp: Date;
  platform: string;
  appVersion?: string;
}

interface ErrorReport {
  error: Error;
  context?: Record<string, any>;
  userId?: string;
  fatal?: boolean;
}

class MonitoringService {
  private enabled: boolean = true;
  private logBuffer: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Bajo Jest no se arranca el temporizador. Seguia vivo despues de que la
    // prueba terminaba y, al disparar flush() contra un modulo de Firebase ya
    // desmontado, tumbaba al corredor entero con
    // "(0 , _firebase.auth) is not a function". Por eso `npx jest` no llegaba
    // a imprimir resultados.
    if (process.env.NODE_ENV !== 'test') {
      this.startFlushInterval();
    }
  }

  private startFlushInterval() {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 30000);
  }

  private sanitizePII(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sensitiveKeys = [
      'password', 'token', 'apiKey', 'secret', 'creditCard', 'cardNumber',
      'cvv', 'ssn', 'taxId', 'email', 'phone', 'address', 'location',
      'latitude', 'longitude', 'lat', 'lng', 'coordinates'
    ];

    const sanitized: any = Array.isArray(data) ? [] : {};

    for (const key in data) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk));

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof data[key] === 'object' && data[key] !== null) {
        sanitized[key] = this.sanitizePII(data[key]);
      } else {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }

  async log(level: LogLevel, message: string, context?: Record<string, any>, userId?: string): Promise<void> {
    const sanitizedContext = context ? this.sanitizePII(context) : undefined;

    const entry: LogEntry = {
      level,
      message,
      context: sanitizedContext,
      userId,
      timestamp: new Date(),
      platform: Platform.OS,
    };

    this.logBuffer.push(entry);

    if (level === 'error' || level === 'critical') {
      await this.flush();
    }

    if (__DEV__) {
      const logFn = level === 'error' || level === 'critical' ? console.error : console.log;
      logFn(`[${level.toUpperCase()}] ${message}`, sanitizedContext || '');
    }
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.logBuffer.length === 0) return;

    // getAuthInstance() puede no estar disponible (arranque, o un modulo ya
    // desmontado): si falla, se descarta el buffer en vez de propagar.
    let usuarioActual = null;
    try {
      usuarioActual = getAuthInstance().currentUser;
    } catch {
      this.logBuffer = [];
      return;
    }
    if (!usuarioActual) {
      this.logBuffer = [];
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      // Firestore rechaza `undefined` en cualquier nivel: antes un solo campo
      // indefinido en el contexto hacia fallar todo el envio de bitacoras.
      const stripUndefined = (value: unknown) => JSON.parse(JSON.stringify(value ?? {}));
      const batch = logsToFlush.map(entry => ({
        level: entry.level,
        message: entry.message,
        context: stripUndefined(entry.context),
        userId: entry.userId || getAuthInstance().currentUser?.uid || null,
        timestamp: Timestamp.fromDate(entry.timestamp),
        platform: entry.platform,
      }));

      for (const log of batch) {
        await addDoc(collection(getDbInstance(), 'logs'), log);
      }

      if (__DEV__) {
        console.log(`[Monitoring] Flushed ${batch.length} logs`);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[Monitoring] Failed to flush logs:', error);
      }
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  async reportError(report: ErrorReport): Promise<void> {
    const { error, context, userId, fatal = false } = report;

    if (!getAuthInstance().currentUser) {
      return;
    }

    const sanitizedContext = context ? this.sanitizePII(context) : {};

    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack || '',
      context: sanitizedContext,
      userId: userId || getAuthInstance().currentUser!.uid,
      fatal,
      timestamp: Timestamp.now(),
      platform: Platform.OS,
    };

    try {
      await addDoc(collection(getDbInstance(), 'errors'), errorData);
      if (__DEV__) {
        console.log('[Monitoring] Error reported:', error.message);
      }
    } catch (err) {
      if (__DEV__) {
        console.error('[Monitoring] Failed to report error:', err);
      }
    }

    await this.log(fatal ? 'critical' : 'error', error.message, {
      ...sanitizedContext,
      stack: error.stack,
    }, userId || getAuthInstance().currentUser!.uid);
  }

  async trackEvent(eventName: string, properties?: Record<string, any>, userId?: string): Promise<void> {
    if (!getAuthInstance().currentUser) {
      return;
    }

    const sanitizedProperties = properties ? this.sanitizePII(properties) : {};

    try {
      await addDoc(collection(getDbInstance(), 'analytics'), {
        eventName,
        properties: sanitizedProperties,
        userId: userId || getAuthInstance().currentUser!.uid,
        timestamp: Timestamp.now(),
        platform: Platform.OS,
      });

      if (__DEV__) {
        console.log('[Monitoring] Event tracked:', eventName);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[Monitoring] Failed to track event:', error);
      }
    }
  }

  async trackPerformance(metric: string, value: number, context?: Record<string, any>): Promise<void> {
    if (!getAuthInstance().currentUser) {
      return;
    }

    try {
      await addDoc(collection(getDbInstance(), 'performance'), {
        metric,
        value,
        context: context || {},
        timestamp: Timestamp.now(),
        platform: Platform.OS,
      });

      if (__DEV__) {
        console.log(`[Monitoring] Performance tracked: ${metric} = ${value}`);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[Monitoring] Failed to track performance:', error);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[Monitoring] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

export const monitoringService = new MonitoringService();
