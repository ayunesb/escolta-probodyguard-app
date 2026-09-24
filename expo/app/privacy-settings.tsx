import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
      setNotice({ tone: 'error', message: 'Your preference could not be saved. Please try again.' });
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
      setNotice({ tone: 'error', message: 'Your data could not be exported. Please try again.' });
    } finally {
      setExporting(false);
    }
  };

  const openDelete = () => {
    setConfirmText('');
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const confirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!user || !confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await gdprService.requestDataDeletion(user.id, 'User requested account deletion');
    } catch (error) {
      logger.error('[PrivacySettings] Deletion request failed', error);
      setDeleteError('Your request could not be sent. Nothing was deleted — please try again.');
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
      <NavBar title="Privacy & data" />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title2">Your data, your rights</AppText>
          <AppText variant="callout">
            Under Mexico’s Federal Law on the Protection of Personal Data Held by Private Parties (LFPDPPP) you can
            access, rectify, cancel or oppose the use of your personal data — your ARCO rights.
          </AppText>
        </View>

        {notice ? <Notice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}

        <SectionTitle title="Your data" />
        <ListGroup>
          <ListRow
            icon={Download}
            title="Export my data"
            subtitle="Download a copy of your profile, bookings and messages"
            onPress={handleExport}
            trailing={exporting ? <ActivityIndicator size="small" color={Colors.accent} /> : undefined}
            showChevron={!exporting}
          />
          <ListRow icon={FileText} title="Privacy policy" subtitle="What we collect and why" onPress={() => router.push('/privacy-policy')} />
          <ListRow
            icon={Mail}
            title="Exercise your ARCO rights"
            subtitle={`Write to ${PRIVACY_EMAIL}`}
            onPress={() => Linking.openURL(`mailto:${PRIVACY_EMAIL}?subject=ARCO%20request`).catch(() => {})}
          />
        </ListGroup>

        <SectionTitle title="Preferences" />
        {consentState === 'loading' ? (
          <SkeletonCard lines={1} />
        ) : consentState === 'error' ? (
          <Notice tone="error" message="Your preferences could not be loaded." actionLabel="Try again" onAction={loadConsent} />
        ) : (
          <ListGroup>
            <ListRow
              icon={Megaphone}
              title="News and offers"
              subtitle="Occasional emails about new services. Off by default."
              showChevron={false}
              trailing={
                <Switch
                  value={marketing}
                  onValueChange={toggleMarketing}
                  disabled={savingMarketing}
                  trackColor={{ false: Colors.borderStrong, true: Colors.accentDark }}
                  thumbColor={marketing ? Colors.accentLight : Colors.textSecondary}
                  ios_backgroundColor={Colors.borderStrong}
                  accessibilityLabel="News and offers emails"
                />
              }
            />
          </ListGroup>
        )}
        <ListGroup style={styles.gapTop}>
          <ListRow
            icon={MapPin}
            title="Location"
            subtitle={
              user?.role === 'guard'
                ? 'Shared with your client only while you are on an active job. Controlled by your device permission.'
                : 'Used to set pickup points and to show your guard during a job. Controlled by your device permission.'
            }
            onPress={Platform.OS === 'web' ? undefined : openDeviceSettings}
            accessibilityHint="Opens your device settings"
          />
        </ListGroup>

        <SectionTitle title="Delete account" />
        <ListGroup>
          <ListRow
            icon={Trash2}
            title="Delete my account"
            subtitle="Request permanent deletion of your account and personal data"
            destructive
            onPress={openDelete}
          />
        </ListGroup>
      </Screen>

      <Sheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        dismissable={!deleting}
        eyebrow="Delete account"
        title="Are you sure?"
        footer={
          <>
            <Button title="Cancel" variant="secondary" onPress={() => setDeleteOpen(false)} disabled={deleting} style={styles.flex} />
            <Button
              title="Delete account"
              variant="danger"
              icon={Trash2}
              onPress={handleDelete}
              disabled={!confirmed}
              loading={deleting}
              style={styles.flex}
              accessibilityLabel="Confirm account deletion request"
            />
          </>
        }
      >
        <AppText variant="callout">
          We will send your request to Escolta Pro and sign you out. Your account and personal data are deleted within
          30 days, except records the law requires us to keep (for example payment and tax records). Upcoming bookings
          are not cancelled or refunded automatically — cancel them first.
        </AppText>
        <Input
          label="Type DELETE to confirm"
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
          accessibilityLabel="Type DELETE to confirm"
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
  flex: {
    flex: 1,
  },
});
