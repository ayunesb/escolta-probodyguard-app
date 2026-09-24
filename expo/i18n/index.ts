// Idioma de la app (ingles / espanol).
//
// Orden para elegir idioma al arrancar: lo que la persona eligio en este
// dispositivo (AsyncStorage) → lo guardado en su perfil → el idioma del
// dispositivo → ingles. i18next se inicia de forma sincrona con el idioma del
// dispositivo para que el primer render ya salga bien; hydrateLanguage() aplica
// la eleccion guardada antes de mostrar la app (el layout raiz la espera).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultNS, resources } from './resources';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'app_language';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function deviceLanguage(): AppLanguage {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as { language?: string }).language : undefined;
    const locale = nav || Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    return locale.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: deviceLanguage(),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    ns: Object.keys(resources.en),
    defaultNS,
    initAsync: false,
    returnNull: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

let hasStoredChoice = false;

/** Aplica el idioma guardado en este dispositivo. Se espera una vez al arrancar. */
export async function hydrateLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isAppLanguage(stored)) {
      hasStoredChoice = true;
      if (i18n.language !== stored) await i18n.changeLanguage(stored);
    }
  } catch {
    // Sin almacenamiento (modo privado, etc.): se queda el idioma del dispositivo.
  }
}

/**
 * El perfil guarda el idioma de la cuenta. Solo se aplica si la persona no
 * eligio uno en este dispositivo (la eleccion local siempre gana) y solo si es
 * espanol: los perfiles antiguos traen "en" por defecto aunque nadie lo haya
 * elegido, y no deben pasar a ingles un telefono configurado en espanol.
 */
export function applyProfileLanguage(language: unknown): void {
  if (hasStoredChoice || language !== 'es') return;
  if (i18n.language !== language) i18n.changeLanguage(language).catch(() => {});
}

/** Cambia el idioma y lo recuerda en este dispositivo. */
export async function setAppLanguage(language: AppLanguage): Promise<void> {
  hasStoredChoice = true;
  await i18n.changeLanguage(language);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Si no se puede guardar, el cambio vale para esta sesion.
  }
}

export function currentLanguage(): AppLanguage {
  const lng = i18n.resolvedLanguage || i18n.language;
  return isAppLanguage(lng) ? lng : 'en';
}

export default i18n;
