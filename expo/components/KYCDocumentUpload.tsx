import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Camera, CircleCheck, FileText, ImagePlus, Upload, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Badge, Button, Card, PressableScale } from '@/components/ui';
import { Notice } from '@/components/backoffice/Notice';
import { openDocument } from '@/components/backoffice/openDocument';
import { kycAuditService } from '@/services/kycAuditService';
import { confirm } from '@/utils/confirm';
import { logger } from '@/utils/logger';

export type DocumentType = 'id' | 'license' | 'vehicle' | 'insurance' | 'outfit' | 'photo';

interface KYCDocumentUploadProps {
  userId: string;
  // El companyId del escolta si pertenece a una empresa, o su propio uid si
  // es independiente. Va en la ruta de Storage ({scopeId}/{userId}/...)
  // porque storage.rules no puede consultar Firestore para saber a quien
  // pertenece este escolta — ver la nota en storage.rules.
  scopeId: string;
  documentType: DocumentType;
  label: string;
  description?: string;
  maxImages?: number;
  initialImages?: string[];
  // Guarda la lista completa de URLs. DEBE lanzar si falla: el componente lo
  // espera y solo muestra "subido" cuando el registro quedo guardado.
  onUpload: (urls: string[]) => Promise<void>;
  disabled?: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
// Foto de perfil y de uniforme se muestran a clientes: van a photos/ (lectura
// publica para autenticados). Los documentos KYC van a documents/ (solo el
// escolta y su empresa).
const PUBLIC_TYPES: DocumentType[] = ['photo', 'outfit'];

type Busy = 'idle' | 'uploading' | 'saving';
interface UploadError {
  message: string;
  retryLabel?: string;
  retry?: () => void;
}

async function uploadToStorage(
  scopeId: string,
  userId: string,
  documentType: DocumentType,
  localUri: string
): Promise<{ url: string; path: string; size: number }> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  if (blob.size > MAX_BYTES) {
    throw Object.assign(new Error('too-large'), { code: 'app/too-large' });
  }
  const root = PUBLIC_TYPES.includes(documentType) ? 'photos' : 'documents';
  const path = `${root}/${scopeId}/${userId}/${documentType}_${Date.now()}.jpg`;
  const fileRef = storageRef(getStorage(), path);
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' });
  const url = await getDownloadURL(fileRef);
  return { url, path, size: blob.size };
}

function uploadErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'app/too-large') return 'That file is larger than 5 MB. Choose a smaller photo.';
  if (code === 'storage/unauthorized') return 'Upload not allowed. Files must be images under 5 MB.';
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/network-request-failed' || /network/i.test(code)) {
    return 'Connection problem while uploading. Check your network and try again.';
  }
  return 'The file could not be uploaded. Please try again.';
}

export default function KYCDocumentUpload({
  userId,
  scopeId,
  documentType,
  label,
  description,
  maxImages = 1,
  onUpload,
  initialImages = [],
  disabled = false,
}: KYCDocumentUploadProps) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<UploadError | null>(null);
  const dirty = useRef(false);

  // Cuando la pantalla termina de cargar los documentos guardados, sincroniza
  // (salvo que el usuario ya haya tocado algo en esta sesion).
  const initialKey = initialImages.join('|');
  useEffect(() => {
    if (!dirty.current) setImages(initialKey ? initialKey.split('|') : []);
  }, [initialKey]);

  const isKyc = !PUBLIC_TYPES.includes(documentType);
  const canAdd = images.length < maxImages && !disabled;

  // Guarda la lista en el registro. Solo si el guardado termina bien se ve
  // como subido; si falla, el archivo ya esta en Storage y el reintento solo
  // repite el guardado.
  const persist = async (next: string[], uploaded?: { path: string; size: number }) => {
    setBusy('saving');
    setError(null);
    try {
      await onUpload(next);
      dirty.current = true;
      setImages(next);
      if (uploaded) {
        await kycAuditService.logDocumentUpload(userId, uploaded.path, documentType, `${uploaded.size}b`);
      }
    } catch (e) {
      logger.error('[KYCUpload] Saving the document record failed', e);
      setError({
        message: uploaded
          ? 'The file was uploaded but your record could not be saved, so it is not on file yet.'
          : 'Your change could not be saved.',
        retryLabel: 'Try saving again',
        retry: () => persist(next, uploaded),
      });
    } finally {
      setBusy('idle');
    }
  };

  const uploadAsset = async (localUri: string) => {
    setBusy('uploading');
    setError(null);
    let uploaded: { url: string; path: string; size: number };
    try {
      uploaded = await uploadToStorage(scopeId, userId, documentType, localUri);
    } catch (e) {
      logger.error('[KYCUpload] Storage upload failed', e);
      setBusy('idle');
      setError({ message: uploadErrorMessage(e), retryLabel: 'Try again', retry: () => uploadAsset(localUri) });
      return;
    }
    await persist([...images, uploaded.url], { path: uploaded.path, size: uploaded.size });
  };

  const pick = async (source: 'library' | 'camera') => {
    if (!canAdd || busy !== 'idle') return;
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          setError({
            message:
              source === 'camera'
                ? 'Camera access is off. Allow it in your device settings to take a photo.'
                : 'Photo library access is off. Allow it in your device settings to choose a file.',
          });
          return;
        }
      }
      const crop = documentType === 'id' || documentType === 'license';
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: crop,
        aspect: crop ? [4, 3] : undefined,
        quality: 0.8,
      };
      const result =
        source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      await uploadAsset(result.assets[0].uri);
    } catch (e) {
      logger.error('[KYCUpload] Picker failed', e);
      setError({ message: 'We could not open your photos. Please try again.' });
    }
  };

  const remove = async (index: number) => {
    if (busy !== 'idle' || disabled) return;
    const ok = await confirm('Remove this file?', `It will no longer be part of your ${label.toLowerCase()}.`, 'Remove', 'Cancel', true);
    if (!ok) return;
    await persist(images.filter((_, i) => i !== index));
  };

  const LeadIcon = PUBLIC_TYPES.includes(documentType) ? Camera : FileText;
  const statusLabel = images.length > 0 ? `${images.length}/${maxImages} on file` : isKyc ? 'Not provided' : 'Optional';

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.leadIcon}>
          <LeadIcon size={18} color={Colors.accent} strokeWidth={ICON_STROKE} />
        </View>
        <View style={styles.headerText}>
          <AppText variant="headline">{label}</AppText>
          {description ? <AppText variant="footnote">{description}</AppText> : null}
        </View>
        <Badge label={statusLabel} tone={images.length > 0 ? 'success' : 'neutral'} />
      </View>

      {images.length > 0 ? (
        <View style={styles.grid}>
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.thumbWrap}>
              <PressableScale
                onPress={() => openDocument(uri)}
                scaleTo={0.97}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open ${label} file ${index + 1}`}
                style={styles.thumb}
              >
                <Image source={{ uri }} style={styles.thumbImage} accessibilityIgnoresInvertColors />
              </PressableScale>
              <View style={styles.savedBadge} pointerEvents="none">
                <CircleCheck size={16} color={Colors.success} fill={Colors.background} strokeWidth={2} />
              </View>
              {!disabled ? (
                <PressableScale
                  onPress={() => remove(index)}
                  disabled={busy !== 'idle'}
                  scaleTo={0.9}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${label} file ${index + 1}`}
                  style={styles.removeButton}
                >
                  <X size={14} color={Colors.textPrimary} strokeWidth={2} />
                </PressableScale>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <Notice
          tone="error"
          message={error.message}
          actionLabel={error.retry ? error.retryLabel ?? 'Try again' : undefined}
          onAction={error.retry}
        />
      ) : null}

      {canAdd ? (
        Platform.OS === 'web' ? (
          <Button
            title={busy === 'uploading' ? 'Uploading…' : busy === 'saving' ? 'Saving…' : images.length > 0 ? 'Add another file' : 'Upload file'}
            icon={Upload}
            variant="outline"
            size="sm"
            loading={busy !== 'idle'}
            onPress={() => pick('library')}
            accessibilityLabel={`Upload ${label}`}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              title="Camera"
              icon={Camera}
              variant="secondary"
              size="sm"
              disabled={busy !== 'idle'}
              onPress={() => pick('camera')}
              style={styles.flex}
              accessibilityLabel={`Take a photo for ${label}`}
            />
            <Button
              title={busy === 'uploading' ? 'Uploading…' : busy === 'saving' ? 'Saving…' : 'Library'}
              icon={ImagePlus}
              variant="outline"
              size="sm"
              loading={busy !== 'idle'}
              onPress={() => pick('library')}
              style={styles.flex}
              accessibilityLabel={`Choose ${label} from your library`}
            />
          </View>
        )
      ) : busy !== 'idle' ? (
        <AppText variant="caption" color={Colors.textTertiary}>
          Saving…
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.lg,
    marginBottom: Space.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  leadIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  thumbWrap: {
    width: 88,
    height: 88,
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  savedBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  flex: {
    flex: 1,
  },
});
