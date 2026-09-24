import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, Badge, NavBar, Screen, SectionTitle, SkeletonCard } from '@/components/ui';
import { Notice, RoleGate, kycMeta } from '@/components/backoffice';
import KYCDocumentUpload from '@/components/KYCDocumentUpload';
import { useAuth } from '@/contexts/AuthContext';
import { GuardKycRecord, KycDocField, PublicGuardMediaField, UserRecord, userService } from '@/services/userService';
import type { User } from '@/types';
import { logger } from '@/utils/logger';

export default function KYCDocumentsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['guard']} nav>
        <KYCDocumentsScreen />
      </RoleGate>
    </>
  );
}

function KYCDocumentsScreen() {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation(['account', 'common']);
  const guard = user as UserRecord;
  const [kyc, setKyc] = useState<GuardKycRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setKyc(await userService.getGuardKyc(guard.id));
    } catch (error) {
      logger.error('[KYCDocuments] Failed to load private KYC record', error);
      setLoadError(t('kyc.loadError'));
    }
  }, [guard.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Cualquier cambio a un documento de verificacion lo manda de vuelta a
  // revision. El dueno solo puede poner 'pending' (nunca aprobarse solo).
  const markPending = async () => {
    if (guard.kycStatus !== 'pending') await updateUser({ kycStatus: 'pending' });
  };

  const saveKyc = (field: KycDocField) => async (urls: string[]) => {
    await userService.saveGuardKycDocuments(guard.id, field, urls);
    setKyc((prev) => ({ ...(prev ?? {}), [field]: urls }));
    await markPending();
  };

  const savePublic = (field: PublicGuardMediaField) => async (urls: string[]) => {
    const updates: Record<string, unknown> = { [field]: urls };
    if (field === 'outfitPhotos' && guard.kycStatus !== 'pending') updates.kycStatus = 'pending';
    await updateUser(updates as Partial<User>);
  };

  // documents/{scopeId}/{userId}/...: scopeId es el companyId si el escolta
  // pertenece a una empresa, o su propio uid si es independiente.
  const scopeId = guard.companyId || guard.id;
  const status = kycMeta(guard.kycStatus);

  return (
    <View style={styles.root}>
      <NavBar title={t('kyc.navTitle')} />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title2">{t('kyc.title')}</AppText>
          <AppText variant="callout">{t('kyc.intro')}</AppText>
          <Badge label={status.label} tone={status.tone} icon={ShieldCheck} style={styles.badge} />
        </View>

        {guard.kycStatus === 'rejected' ? (
          <Notice
            tone="error"
            title={t('kyc.rejectedTitle')}
            message={kyc?.rejectionReason ? t('kyc.rejectedWithNote', { reason: kyc.rejectionReason }) : t('kyc.rejected')}
          />
        ) : guard.kycStatus === 'approved' ? (
          <Notice tone="success" message={t('kyc.approved')} />
        ) : (
          <Notice tone="info" message={t('kyc.pending')} />
        )}

        {loadError ? (
          <Notice tone="error" message={loadError} actionLabel={t('common:actions.tryAgain')} onAction={load} style={styles.gapTop} />
        ) : null}

        <SectionTitle title={t('kyc.shownToClients')} />
        <KYCDocumentUpload
          userId={guard.id}
          scopeId={scopeId}
          documentType="photo"
          label={t('kyc.docs.photo.label')}
          description={t('kyc.docs.photo.description')}
          maxImages={1}
          initialImages={guard.photos ?? []}
          onUpload={savePublic('photos')}
        />
        <KYCDocumentUpload
          userId={guard.id}
          scopeId={scopeId}
          documentType="outfit"
          label={t('kyc.docs.outfit.label')}
          description={t('kyc.docs.outfit.description')}
          maxImages={3}
          initialImages={guard.outfitPhotos ?? []}
          onUpload={savePublic('outfitPhotos')}
        />

        <SectionTitle title={t('kyc.private')} />
        {kyc === null && !loadError ? (
          <>
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </>
        ) : kyc !== null ? (
          <>
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="id"
              label={t('kyc.docs.id.label')}
              description={t('kyc.docs.id.description')}
              maxImages={2}
              initialImages={kyc.governmentIdUrls ?? []}
              onUpload={saveKyc('governmentIdUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="license"
              label={t('kyc.docs.license.label')}
              description={t('kyc.docs.license.description')}
              maxImages={2}
              initialImages={kyc.licenseUrls ?? []}
              onUpload={saveKyc('licenseUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="insurance"
              label={t('kyc.docs.insurance.label')}
              description={t('kyc.docs.insurance.description')}
              maxImages={2}
              initialImages={kyc.insuranceUrls ?? []}
              onUpload={saveKyc('insuranceUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="vehicle"
              label={t('kyc.docs.vehicle.label')}
              description={t('kyc.docs.vehicle.description')}
              maxImages={3}
              initialImages={kyc.vehicleDocUrls ?? []}
              onUpload={saveKyc('vehicleDocUrls')}
            />
          </>
        ) : null}
        <AppText variant="caption" color={Colors.textTertiary} style={styles.footnote}>
          {t('kyc.footnote')}
        </AppText>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingTop: Space.xl,
  },
  intro: {
    gap: Space.sm,
    marginBottom: Space.lg,
  },
  badge: {
    marginTop: Space.xs,
  },
  gapTop: {
    marginTop: Space.md,
  },
  footnote: {
    marginTop: Space.sm,
  },
});
