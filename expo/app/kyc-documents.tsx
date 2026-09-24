import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
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
  const guard = user as UserRecord;
  const [kyc, setKyc] = useState<GuardKycRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setKyc(await userService.getGuardKyc(guard.id));
    } catch (error) {
      logger.error('[KYCDocuments] Failed to load private KYC record', error);
      setLoadError('We could not load your documents.');
    }
  }, [guard.id]);

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
      <NavBar title="My documents" />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title2">Verification</AppText>
          <AppText variant="callout">
            ID, license, insurance and vehicle files are private: only you, your company and Escolta Pro reviewers can
            open them. Your profile and outfit photos are shown to clients.
          </AppText>
          <Badge label={status.label} tone={status.tone} icon={ShieldCheck} style={styles.badge} />
        </View>

        {guard.kycStatus === 'rejected' ? (
          <Notice
            tone="error"
            title="Your last submission was not approved"
            message={
              kyc?.rejectionReason
                ? `Reviewer note: ${kyc.rejectionReason}. Upload updated files to resubmit.`
                : 'Upload updated files to resubmit for review.'
            }
          />
        ) : guard.kycStatus === 'approved' ? (
          <Notice tone="success" message="You're verified. Changing a verification file sends your profile back for review." />
        ) : (
          <Notice tone="info" message="Your documents are waiting for review by Escolta Pro. Keep them up to date here." />
        )}

        {loadError ? (
          <Notice tone="error" message={loadError} actionLabel="Try again" onAction={load} style={styles.gapTop} />
        ) : null}

        <SectionTitle title="Shown to clients" />
        <KYCDocumentUpload
          userId={guard.id}
          scopeId={scopeId}
          documentType="photo"
          label="Profile photo"
          description="A clear, recent photo of your face."
          maxImages={1}
          initialImages={guard.photos ?? []}
          onUpload={savePublic('photos')}
        />
        <KYCDocumentUpload
          userId={guard.id}
          scopeId={scopeId}
          documentType="outfit"
          label="Outfit photos"
          description="Your uniform or work attire."
          maxImages={3}
          initialImages={guard.outfitPhotos ?? []}
          onUpload={savePublic('outfitPhotos')}
        />

        <SectionTitle title="Private — for verification" />
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
              label="Government ID"
              description="INE, passport or another valid photo ID. Both sides if applicable."
              maxImages={2}
              initialImages={kyc.governmentIdUrls ?? []}
              onUpload={saveKyc('governmentIdUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="license"
              label="Security license"
              description="Your private security license or credential."
              maxImages={2}
              initialImages={kyc.licenseUrls ?? []}
              onUpload={saveKyc('licenseUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="insurance"
              label="Insurance"
              description="Proof of liability insurance, if you have it."
              maxImages={2}
              initialImages={kyc.insuranceUrls ?? []}
              onUpload={saveKyc('insuranceUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={scopeId}
              documentType="vehicle"
              label="Vehicle documents"
              description="Registration and insurance, if you provide a vehicle."
              maxImages={3}
              initialImages={kyc.vehicleDocUrls ?? []}
              onUpload={saveKyc('vehicleDocUrls')}
            />
          </>
        ) : null}
        <AppText variant="caption" color={Colors.textTertiary} style={styles.footnote}>
          Images only, up to 5 MB each.
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
