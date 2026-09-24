import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import i18n from '@/i18n';

export type SaveResult = 'downloaded' | 'shared' | 'copied' | 'dismissed';

// Guarda un archivo de texto (CSV/JSON) de verdad: descarga en web, hoja de
// compartir en el telefono y, si no hay hoja de compartir, portapapeles.
export async function saveTextFile({
  filename,
  content,
  mimeType,
  title,
}: {
  filename: string;
  content: string;
  mimeType: string;
  title?: string;
}): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error(i18n.t('backoffice:export.unavailable'));
    }
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return 'downloaded';
  }

  try {
    const result = await Share.share({ title: title ?? filename, message: content });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    await Clipboard.setStringAsync(content);
    return 'copied';
  }
}

// `what` ya viene traducido por quien llama ("Registro de 7 reservas").
export function describeSave(result: SaveResult, what: string): string | null {
  switch (result) {
    case 'downloaded':
      return i18n.t('backoffice:export.downloaded', { what });
    case 'shared':
      return i18n.t('backoffice:export.shared', { what });
    case 'copied':
      return i18n.t('backoffice:export.copied', { what });
    default:
      return null;
  }
}

type Cell = string | number | boolean | null | undefined;

// CSV con comillas correctas y sin formulas: una celda que empieza con = + - @
// se abre como formula en Excel/Sheets (inyeccion de CSV).
export function toCSV(headers: string[], rows: Cell[][]): string {
  const escape = (value: Cell): string => {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  // BOM para que Excel respete los acentos
  return `\uFEFF${lines.join('\r\n')}`;
}

export function fileStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
