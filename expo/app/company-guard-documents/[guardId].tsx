import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, UserX } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, Avatar, Badge, EmptyState, NavBar, Screen, SectionTitle, SkeletonCard } from '@/components/ui';
import { Notice, RoleGate, fullName, kycMeta } from '@/components/backoffice';
import KYCDocumentUpload from '@/components/KYCDocumentUpload';
import { useAuth } from '@/contexts/AuthContext';
import { GuardKycRecord, KycDocField, PublicGuardMediaField, UserRecord, userService } from '@/services/userService';
import { logger } from '@/utils/logger';

export default function CompanyGuardDocumentsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['company', 'admin']} nav>
        <CompanyGuardDocumentsScreen />
      </RoleGate>
    </>
  );
}

function CompanyGuardDocumentsScreen() {
  const router = useRouter();
  const { t } = useTranslation(['backoffice', 'common']);
  const { guardId } = useLocalSearchParams<{ guardId: string }>();
  const { user } = useAuth();
  const [guard, setGuard] = useState<UserRecord | null>(null);
  const [kyc, setKyc] = useState<GuardKycRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  const load = useCallback(async () => {
    if (!guardId) {
      setState('missing');
      return;
    }
    setState('loading');
    try {
      const record = await userService.getUser(guardId);
      if (!record || record.role !== 'guard') {
        setState('missing');
        return;
      }
      setGuard(record);
      // El documento privado solo lo puede leer la empresa DE ESTE escolta
      // (o admin): si no es suyo, las reglas lo niegan y se muestra "sin acceso".
      const allowed = user?.role === 'admin' || (user?.role === 'company' && record.companyId === user.id);
      if (allowed) setKyc(await userService.getGuardKyc(guardId));
      setState('ready');
    } catch (error) {
      logger.error('[CompanyGuardDocuments] Failed to load guard', error);
      setState('error');
    }
  }, [guardId, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canManage =
    !!user && !!guard && (user.role === 'admin' || (user.role === 'company' && guard.companyId === user.id));

  // La empresa solo puede devolver el KYC a 'pending' (CONTRACT §5); aprobar
  // es exclusivo de admin.
  const markPending = async () => {
    if (!guard || guard.kycStatus === 'pending') return;
    await userService.updateGuardMedia(guard.id, { kycStatus: 'pending' });
    setGuard((g) => (g ? { ...g, kycStatus: 'pending' } : g));
  };

  const saveKyc = (field: KycDocField) => async (urls: string[]) => {
    if (!guard) throw new Error('Guard not loaded');
    await userService.saveGuardKycDocuments(guard.id, field, urls);
    setKyc((prev) => ({ ...(prev ?? {}), [field]: urls }));
    await markPending();
  };

  const savePublic = (field: PublicGuardMediaField) => async (urls: string[]) => {
    if (!guard) throw new Error('Guard not loaded');
    const needsReview = field === 'outfitPhotos' && guard.kycStatus !== 'pending';
    await userService.updateGuardMedia(guard.id, { [field]: urls, ...(needsReview ? { kycStatus: 'pending' as const } : {}) });
    setGuard((g) => (g ? { ...g, [field]: urls, ...(needsReview ? { kycStatus: 'pending' as const } : {}) } : g));
  };

  const title = guard ? fullName(guard) : t('guardDocs.title');

  return (
    <View style={styles.root}>
      <NavBar title={t('guardDocs.navTitle')} />
      <Screen padTop={false} contentStyle={styles.content}>
        {state === 'loading' ? (
          <>
            <SkeletonCard media lines={1} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </>
        ) : state === 'error' ? (
          <Notice tone="error" message={t('guardDocs.loadError')} actionLabel={t('common:actions.tryAgain')} onAction={load} />
        ) : state === 'missing' || !guard ? (
          <EmptyState
            icon={UserX}
            title={t('guardDocs.notFoundTitle')}
            message={t('guardDocs.notFoundMessage')}
            actionLabel={t('guardDocs.backToGuards')}
            onAction={() => router.replace('/(tabs)/company-guards')}
          />
        ) : !canManage ? (
          <EmptyState
            icon={UserX}
            title={t('guardDocs.noAccessTitle')}
            message={t('guardDocs.noAccessMessage')}
            actionLabel={t('guardDocs.backToGuards')}
            onAction={() => router.replace('/(tabs)/company-guards')}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Avatar name={title} uri={guard.photos?.[0]} size={64} verified={guard.kycStatus === 'approved'} />
              <View style={styles.headerText}>
                <AppText variant="title2" numberOfLines={2}>
                  {title}
                </AppText>
                <AppText variant="footnote" numberOfLines={1}>
                  {guard.email}
                </AppText>
                <Badge {...kycMeta(guard.kycStatus)} icon={ShieldCheck} style={styles.badge} />
              </View>
            </View>

            <Notice
              tone={guard.kycStatus === 'rejected' ? 'error' : 'info'}
              message={
                guard.kycStatus === 'rejected'
                  ? kyc?.rejectionReason
                    ? t('guardDocs.rejectedWithNote', { note: kyc.rejectionReason })
                    : t('guardDocs.rejected')
                  : t('guardDocs.info')
              }
            />

            <SectionTitle title={t('guardDocs.shownToClients')} />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="photo"
              label={t('docs.photo')}
              description={t('guardDocs.photoDescription')}
              maxImages={1}
              initialImages={guard.photos ?? []}
              onUpload={savePublic('photos')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="outfit"
              label={t('docs.outfits')}
              description={t('guardDocs.outfitDescription')}
              maxImages={3}
              initialImages={guard.outfitPhotos ?? []}
              onUpload={savePublic('outfitPhotos')}
            />

            <SectionTitle title={t('guardDocs.private')} />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="id"
              label={t('docs.governmentId')}
              description={t('guardDocs.idDescription')}
              maxImages={2}
              initialImages={kyc?.governmentIdUrls ?? []}
              onUpload={saveKyc('governmentIdUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="license"
              label={t('docs.license')}
              description={t('guardDocs.licenseDescription')}
              maxImages={2}
              initialImages={kyc?.licenseUrls ?? []}
              onUpload={saveKyc('licenseUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="insurance"
              label={t('docs.insurance')}
              description={t('guardDocs.insuranceDescription')}
              maxImages={2}
              initialImages={kyc?.insuranceUrls ?? []}
              onUpload={saveKyc('insuranceUrls')}
            />
            <KYCDocumentUpload
              userId={guard.id}
              scopeId={guard.companyId || guard.id}
              documentType="vehicle"
              label={t('docs.vehicles')}
              description={t('guardDocs.vehicleDescription')}
              maxImages={3}
              initialImages={kyc?.vehicleDocUrls ?? []}
              onUpload={saveKyc('vehicleDocUrls')}
            />
          </>
        )}
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
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    marginBottom: Space.xl,
  },
  headerText: {
    flex: 1,
    gap: Space.xs,
  },
  badge: {
    marginTop: Space.xs,
  },
});
