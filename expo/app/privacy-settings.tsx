import { openContact } from '@/utils/openContact';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Mail, MapPin, Megaphone, Trash2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, Button, Input, ListGroup, ListRow, NavBar, Screen, SectionTitle, SkeletonCard } from '@/components/ui';
import { Notice, RoleGate, Sheet, exportMyData } from '@/components/backoffice';
import { useAuth } from '@/contexts/AuthContext';
import { consentService } from '@/services/consentService';
import { gdprService } from '@/services/gdprService';
import { logger } from '@/utils/logger';

const PRIVACY_EMAIL = 'privacy@escoltapro.mx';
// react-native-web pinta el pulgar encendido en #009688 salvo que se pase activeThumbColor.
const WEB_SWITCH_ON = Platform.OS === 'web' ? ({ activeThumbColor: Colors.accentLight } as object) : null;

export default function PrivacySettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RoleGate roles={['client', 'guard', 'company', 'admin']} nav>
        <PrivacySettingsScreen />
      </RoleGate>
    </>
  );
}

function PrivacySettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t } = useTranslation(['account', 'common']);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const [consentState, setConsentState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [marketing, setMarketing] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadConsent = useCallback(async () => {
    if (!user) return;
    setConsentState('loading');
    try {
      const consent = await consentService.getConsent(user.id);
      setMarketing(consent?.marketing ?? false);
      setConsentState('ready');
    } catch (error) {
      logger.error('[PrivacySettings] Failed to load consent', error);
      setConsentState('error');
    }
  }, [user]);

  useEffect(() => {
    loadConsent();
  }, [loadConsent]);

  const toggleMarketing = async (value: boolean) => {
    if (!user) return;
    const previous = marketing;
    setMarketing(value);
    setSavingMarketing(true);
    try {
      await consentService.updateConsent(user.id, { marketing: value });
    } catch (error) {
      logger.error('[PrivacySettings] Failed to update consent', error);
      setMarketing(previous);
      setNotice({ tone: 'error', message: t('privacySettings.marketing.saveFailed') });
    } finally {
      setSavingMarketing(false);
    }
  };

  const handleExport = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const { message, partial } = await exportMyData(user.id);
      if (message) setNotice({ tone: partial ? 'info' : 'success', message });
    } catch (error) {
      logger.error('[PrivacySettings] Export failed', error);
      setNotice({ tone: 'error', message: t('privacySettings.export.failed') });
    } finally {
      setExporting(false);
    }
  };

  const openDelete = () => {
    setConfirmText('');
    setDeleteError(null);
    setDeleteOpen(true);
  };

  // La palabra de confirmacion sigue al idioma (DELETE / ELIMINAR); se acepta
  // tambien la inglesa por si la persona cambio de idioma a medio camino.
  const keyword = t('privacySettings.deleteSheet.keyword');
  const typed = confirmText.trim().toUpperCase();
  const confirmed = typed === keyword || typed === 'DELETE';

  const handleDelete = async () => {
    if (!user || !confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await gdprService.requestDataDeletion(user.id, 'User requested account deletion');
    } catch (error) {
      logger.error('[PrivacySettings] Deletion request failed', error);
      setDeleteError(t('privacySettings.deleteSheet.failed'));
      setDeleting(false);
      return;
    }
    // Cerrar sesion ANTES de ir a la pantalla de acceso: si no, sign-in ve la
    // sesion abierta y devuelve a la persona a la app.
    await signOut();
    setDeleteOpen(false);
    router.replace('/auth/sign-in');
  };

  const openDeviceSettings = () => {
    if (Platform.OS === 'web') return;
    Linking.openSettings().catch((error) => logger.error('[PrivacySettings] Could not open settings', error));
  };

  return (
    <View style={styles.root}>
      <NavBar title={t('privacySettings.navTitle')} />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title2">{t('privacySettings.title')}</AppText>
          <AppText variant="callout">{t('privacySettings.intro')}</AppText>
        </View>

        {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}

        <SectionTitle title={t('privacySettings.sections.yourData')} />
        <ListGroup>
          <ListRow
            icon={Download}
            title={t('privacySettings.export.title')}
            subtitle={t('privacySettings.export.subtitle')}
            onPress={handleExport}
            trailing={exporting ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined}
            showChevron={!exporting}
          />
          <ListRow
            icon={FileText}
            title={t('privacySettings.policy.title')}
            subtitle={t('privacySettings.policy.subtitle')}
            onPress={() => router.push('/privacy-policy')}
          />
          <ListRow
            icon={Mail}
            title={t('privacySettings.arco.title')}
            subtitle={t('privacySettings.arco.subtitle', { email: PRIVACY_EMAIL })}
            onPress={() =>
              openContact(
                `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(t('privacySettings.arco.emailSubject'))}`
              ).catch(() => {})
            }
          />
        </ListGroup>

        <SectionTitle title={t('privacySettings.sections.preferences')} />
        {consentState === 'loading' ? (
          <SkeletonCard lines={1} />
        ) : consentState === 'error' ? (
          <Notice
            tone="error"
            message={t('privacySettings.loadFailed')}
            actionLabel={t('common:actions.tryAgain')}
            onAction={loadConsent}
          />
        ) : (
          <ListGroup>
            <ListRow
              icon={Megaphone}
              title={t('privacySettings.marketing.title')}
              subtitle={t('privacySettings.marketing.subtitle')}
              showChevron={false}
              trailing={
                <Switch
                  value={marketing}
                  onValueChange={toggleMarketing}
                  disabled={savingMarketing}
                  trackColor={{ false: Colors.borderStrong, true: Colors.accentDark }}
                  thumbColor={marketing ? Colors.accentLight : Colors.textSecondary}
                  ios_backgroundColor={Colors.borderStrong}
                  {...WEB_SWITCH_ON}
                  accessibilityLabel={t('privacySettings.marketing.a11y')}
                />
              }
            />
          </ListGroup>
        )}
        <ListGroup style={styles.gapTop}>
          <ListRow
            icon={MapPin}
            title={t('privacySettings.location.title')}
            subtitle={user?.role === 'guard' ? t('privacySettings.location.guard') : t('privacySettings.location.client')}
            onPress={Platform.OS === 'web' ? undefined : openDeviceSettings}
            accessibilityHint={t('privacySettings.location.hint')}
          />
        </ListGroup>
        {/* Fuera de la fila: el subtitulo de ListRow se corta a 2 lineas. */}
        <AppText variant="footnote" color={Colors.textTertiary} style={styles.groupFooter}>
          {t('privacySettings.location.permission')}
        </AppText>

        <SectionTitle title={t('privacySettings.sections.deleteAccount')} />
        <ListGroup>
          <ListRow
            icon={Trash2}
            title={t('privacySettings.deleteRow.title')}
            subtitle={t('privacySettings.deleteRow.subtitle')}
            destructive
            onPress={openDelete}
          />
        </ListGroup>
      </Screen>

      <Sheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        dismissable={!deleting}
        eyebrow={t('privacySettings.deleteSheet.eyebrow')}
        title={t('privacySettings.deleteSheet.title')}
        footer={
          <>
            <Button title={t('common:actions.cancel')} variant="secondary" onPress={() => setDeleteOpen(false)} disabled={deleting} style={styles.flex} />
            <Button
              title={t('privacySettings.deleteSheet.confirm')}
              variant="danger"
              icon={Trash2}
              onPress={handleDelete}
              disabled={!confirmed}
              loading={deleting}
              style={styles.flex}
              accessibilityLabel={t('privacySettings.deleteSheet.confirmA11y')}
            />
          </>
        }
      >
        <AppText variant="callout">{t('privacySettings.deleteSheet.body')}</AppText>
        <Input
          label={t('privacySettings.deleteSheet.inputLabel', { keyword })}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={keyword}
          accessibilityLabel={t('privacySettings.deleteSheet.inputLabel', { keyword })}
          returnKeyType="done"
          onSubmitEditing={handleDelete}
        />
        {deleteError ? <Notice tone="error" message={deleteError} /> : null}
      </Sheet>
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
  gapTop: {
    marginTop: Space.md,
  },
  groupFooter: {
    marginTop: Space.sm,
    paddingHorizontal: Space.lg,
  },
  flex: {
    flex: 1,
  },
});
