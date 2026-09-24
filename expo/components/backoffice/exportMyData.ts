import i18n from '@/i18n';
import { gdprService } from '@/services/gdprService';
import { describeSave, fileStamp, saveTextFile } from './exportFile';

const SECTION_KEYS = [
  'profile',
  'verificationDocuments',
  'bookings',
  'messages',
  'reviewsWritten',
  'reviewsReceived',
  'payouts',
  'ledger',
  'emergencyAlerts',
  'notifications',
  'deletionRequests',
  'privacyPreferences',
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

// "reviewsWritten" → "reseñas que escribió"; una seccion nueva sin traduccion se muestra tal cual.
const sectionName = (name: string): string =>
  SECTION_KEYS.includes(name as SectionKey) ? i18n.t(`backoffice:export.sections.${name as SectionKey}`) : name;

// Exporta los datos de la persona como JSON (descarga en web, compartir en el
// telefono). Devuelve el texto a mostrar; lanza si no se pudo exportar nada.
export async function exportMyData(userId: string): Promise<{ message: string | null; partial: boolean }> {
  const data = await gdprService.exportUserData(userId);
  const result = await saveTextFile({
    filename: `escolta-pro-my-data-${fileStamp()}.json`,
    content: JSON.stringify(data, null, 2),
    mimeType: 'application/json',
    title: i18n.t('backoffice:export.myDataTitle'),
  });
  const partial = data.unavailableSections.length > 0;
  const base = describeSave(result, i18n.t('backoffice:export.myDataWhat'));
  return {
    message: base
      ? partial
        ? i18n.t('backoffice:export.partial', { base, sections: data.unavailableSections.map(sectionName).join(', ') })
        : base
      : null,
    partial,
  };
}
