import { PUBLIC_DEMO } from '@/constants/demo';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { logger } from '@/utils/logger';

// Abre un documento (URL de descarga de Storage) sin salir de la app en el
// telefono y en una pestana nueva en web. Devuelve false si no se pudo.
export async function openDocument(url: string): Promise<boolean> {
  if (PUBLIC_DEMO && /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(url)) {
    // Decode synchronously so opening the file retains the user's click activation.
    const split = url.indexOf(',');
    const bytes = Uint8Array.from(atob(url.slice(split + 1)), c => c.charCodeAt(0));
    const local = URL.createObjectURL(new Blob([bytes], { type: url.slice(5, url.indexOf(';')) }));
    window.open(local, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(local), 60000);
    return true;
  }
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      }
      await Linking.openURL(url);
      return true;
    }
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch (error) {
    logger.error('[Backoffice] Could not open document', error);
    return false;
  }
}
