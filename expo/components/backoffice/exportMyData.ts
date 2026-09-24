import { gdprService } from '@/services/gdprService';
import { describeSave, fileStamp, saveTextFile } from './exportFile';

// Exporta los datos de la persona como JSON (descarga en web, compartir en el
// telefono). Devuelve el texto a mostrar; lanza si no se pudo exportar nada.
export async function exportMyData(userId: string): Promise<{ message: string | null; partial: boolean }> {
  const data = await gdprService.exportUserData(userId);
  const result = await saveTextFile({
    filename: `escolta-pro-my-data-${fileStamp()}.json`,
    content: JSON.stringify(data, null, 2),
    mimeType: 'application/json',
    title: 'My Escolta Pro data',
  });
  const partial = data.unavailableSections.length > 0;
  const base = describeSave(result, 'Your data export');
  return {
    message: base ? (partial ? `${base} Some sections could not be read: ${data.unavailableSections.join(', ')}.` : base) : null,
    partial,
  };
}
