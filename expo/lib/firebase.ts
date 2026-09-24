import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  Auth,
  connectAuthEmulator,
  browserLocalPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, Database, connectDatabaseEmulator } from 'firebase/database';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// App Check imports commented out - requires Firebase Console setup first
// import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import Constants from 'expo-constants';



// Modo emulador (solo desarrollo, EXPO_PUBLIC_USE_EMULATORS=1): la app usa un
// proyecto "demo-". Firebase garantiza que un proyecto demo- jamas toca uno
// real, asi que en este modo es imposible escribir en produccion aunque algo
// quede mal configurado. Lo usa el acceso rapido de pruebas (ver
// scripts/emulator/README.md).
export const USING_EMULATORS = __DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === '1';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '127.0.0.1';
export const EMULATOR_PROJECT_ID = 'demo-escolta';

const productionConfig = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyAjjsRChFfCQi3piUdtiUCqyysFrh2Cdes',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    'escolta-pro-fe90e.firebaseapp.com',
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    'escolta-pro-fe90e',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    'escolta-pro-fe90e.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    '919834684647',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    Constants.expoConfig?.extra?.EXPO_PUBLIC_FIREBASE_APP_ID ||
    '1:919834684647:web:60dad6457ad0f92b068642',
};

const emulatorConfig = {
  apiKey: 'demo-api-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT_ID,
  storageBucket: `${EMULATOR_PROJECT_ID}.appspot.com`,
  databaseURL: `https://${EMULATOR_PROJECT_ID}-default-rtdb.firebaseio.com`,
  appId: '1:000000000000:web:demo',
};

const firebaseConfig = USING_EMULATORS ? emulatorConfig : productionConfig;

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;
let realtimeDbInstance: Database | undefined;
let functionsInstance: Functions | undefined;
let initialized = false;

export const initializeFirebaseServices = async (): Promise<void> => {
  if (initialized) {
    console.log('[Firebase] Already initialized');
    return;
  }

  try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    console.log('[Firebase] App initialized');

    // TEMPORARILY DISABLED: App Check initialization
    // App Check requires manual configuration in Firebase Console first
    // See DEPLOYMENT_STATUS.md for setup instructions
    // 
    // Enable App Check for web (only in production)
    // if (!__DEV__ && Platform.OS === 'web' && typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined') {
    //   try {
    //     initializeAppCheck(app, {
    //       provider: new ReCaptchaV3Provider(
    //         process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || 
    //         '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'
    //       ),
    //       isTokenAutoRefreshEnabled: true
    //     });
    //     console.log('[Firebase] App Check initialized for web');
    //   } catch {
    //     console.warn('[Firebase] App Check initialization failed (non-critical)');
    //   }
    // } else if (__DEV__) {
    //   console.log('[AppCheck] Skipped in web development mode');
    // }
    console.log('[AppCheck] DISABLED - Requires Firebase Console setup. See DEPLOYMENT_STATUS.md');

    // ✅ Proper Auth Initialization with AsyncStorage persistence
    try {
      if (Platform.OS === 'web') {
        // Web uses browser local persistence
        authInstance = initializeAuth(app as FirebaseApp, {
          persistence: browserLocalPersistence,
        });
        console.log('[Firebase] Auth initialized with browser persistence (web)');
      } else {
        // React Native: persistencia en AsyncStorage con el adaptador oficial.
        // Antes se pasaba un objeto armado a mano; Firebase exige una clase,
        // lanzaba, y el respaldo dejaba la sesion SOLO en memoria: cada vez que
        // se cerraba la app habia que volver a iniciar sesion. La funcion solo
        // existe en el build de React Native de firebase/auth, de ahi el require.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getReactNativePersistence } = require('firebase/auth') as {
          getReactNativePersistence: (storage: typeof AsyncStorage) => import('firebase/auth').Persistence;
        };
        authInstance = initializeAuth(app as FirebaseApp, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
        console.log('[Firebase] Auth initialized with AsyncStorage persistence (native)');
      }
    } catch (error) {
      console.warn('[Firebase] initializeAuth failed, falling back to getAuth:', error);
      try {
        authInstance = getAuth(app as FirebaseApp);
        console.log('[Firebase] Auth initialized with getAuth fallback');
      } catch (fallbackError) {
        console.error('[Firebase] getAuth fallback failed:', fallbackError);
      }
    }

    try {
      dbInstance = getFirestore(app as FirebaseApp);
      console.log('[Firebase] Firestore initialized');
    } catch (_e) {
      console.error('[Firebase] Firestore init error:', _e);
    }

    try {
      realtimeDbInstance = getDatabase(app as FirebaseApp);
      console.log('[Firebase] Realtime Database initialized');
    } catch (_e) {
      console.error('[Firebase] Realtime DB init error:', _e);
    }

    try {
      functionsInstance = getFunctions(app as FirebaseApp);
      console.log('[Firebase] Functions initialized');
    } catch (_e) {
      console.error('[Firebase] Functions init error:', _e);
    }

    // Emuladores locales (solo desarrollo). Ver USING_EMULATORS arriba.
    if (USING_EMULATORS && authInstance && dbInstance && realtimeDbInstance) {
      try {
        connectAuthEmulator(authInstance, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        connectFirestoreEmulator(dbInstance, EMULATOR_HOST, 8080);
        connectDatabaseEmulator(realtimeDbInstance, EMULATOR_HOST, 9000);
        connectStorageEmulator(getStorage(app as FirebaseApp), EMULATOR_HOST, 9199);
        if (functionsInstance) connectFunctionsEmulator(functionsInstance, EMULATOR_HOST, 5001);
        console.log(`[Firebase] Emulator mode: project ${EMULATOR_PROJECT_ID} @ ${EMULATOR_HOST}`);
      } catch (e) {
        console.warn('[Firebase] Emulator connection issue:', e);
      }
    }

    initialized = true;
  } catch {
    console.error('[Firebase] Initialization error');
    throw new Error('Firebase initialization failed');
  }
};

// Export singletons
export const auth = (): Auth => {
  if (authInstance) return authInstance;
  try {
    const fallback = getAuth(getApp());
    console.warn('[Firebase] auth was not initialized via initializeFirebaseServices(); returning getAuth() fallback');
    return fallback;
  } catch {
    throw new Error('[Firebase] Auth not initialized and fallback failed. Call initializeFirebaseServices() first.');
  }
};

export const db = (): Firestore => {
  if (dbInstance) return dbInstance;
  try {
    const fallback = getFirestore(getApp());
    console.warn('[Firebase] Firestore was not initialized via initializeFirebaseServices(); returning getFirestore() fallback');
    return fallback;
  } catch {
    throw new Error('[Firebase] Firestore not initialized and fallback failed. Call initializeFirebaseServices() first.');
  }
};

export const realtimeDb = (): Database => {
  if (realtimeDbInstance) return realtimeDbInstance;
  try {
    const fallback = getDatabase(getApp());
    console.warn('[Firebase] Realtime DB was not initialized via initializeFirebaseServices(); returning getDatabase() fallback');
    return fallback;
  } catch {
    throw new Error('[Firebase] Realtime Database not initialized and fallback failed. Call initializeFirebaseServices() first.');
  }
};

export const functions = (): Functions => {
  if (functionsInstance) return functionsInstance;
  try {
    const fallback = getFunctions(getApp());
    console.warn('[Firebase] Functions was not initialized via initializeFirebaseServices(); returning getFunctions() fallback');
    return fallback;
  } catch {
    throw new Error('[Firebase] Functions not initialized and fallback failed. Call initializeFirebaseServices() first.');
  }
};

// App secundaria SOLO para que una empresa cree la cuenta de un escolta sin
// cerrar su propia sesion. crear un usuario con el SDK de cliente autentica
// automaticamente como ese usuario nuevo en el mismo Auth — si usara el auth
// principal, la empresa quedaria deslogueada y logueada como su escolta
// recien creado. Con persistencia en memoria (no localStorage/AsyncStorage)
// para que no deje sesion residual del escolta al recargar la pagina.
const SECONDARY_APP_NAME = 'GuardInviteSecondary';
let secondaryAuthInstance: Auth | undefined;
let secondaryDbInstance: Firestore | undefined;
let secondaryRealtimeDbInstance: Database | undefined;

const getSecondaryApp = (): FirebaseApp => {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  return existing ?? initializeApp(firebaseConfig, SECONDARY_APP_NAME);
};

export const secondaryAuth = (): Auth => {
  if (secondaryAuthInstance) return secondaryAuthInstance;
  secondaryAuthInstance = initializeAuth(getSecondaryApp(), { persistence: inMemoryPersistence });
  if (USING_EMULATORS) connectAuthEmulator(secondaryAuthInstance, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  return secondaryAuthInstance;
};

export const secondaryDb = (): Firestore => {
  if (secondaryDbInstance) return secondaryDbInstance;
  secondaryDbInstance = getFirestore(getSecondaryApp());
  if (USING_EMULATORS) connectFirestoreEmulator(secondaryDbInstance, EMULATOR_HOST, 8080);
  return secondaryDbInstance;
};

// Realtime Database de la misma sesion secundaria: el escolta recien creado
// escribe su propio espejo de rol (role + companyId), que las reglas solo
// aceptan del propio usuario al crearse.
export const secondaryRealtimeDb = (): Database => {
  if (secondaryRealtimeDbInstance) return secondaryRealtimeDbInstance;
  secondaryRealtimeDbInstance = getDatabase(getSecondaryApp());
  if (USING_EMULATORS) connectDatabaseEmulator(secondaryRealtimeDbInstance, EMULATOR_HOST, 9000);
  return secondaryRealtimeDbInstance;
};
