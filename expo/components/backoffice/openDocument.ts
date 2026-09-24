import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { logger } from '@/utils/logger';

// Abre un documento (URL de descarga de Storage) sin salir de la app en el
// telefono y en una pestana nueva en web. Devuelve false si no se pudo.
export async function openDocument(url: string): Promise<boolean> {
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
