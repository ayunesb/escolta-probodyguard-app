import { openContact } from '@/utils/openContact';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Space } from '@/constants/design';
import { AppText, Badge, Button, Divider, NavBar, Screen } from '@/components/ui';
import { Notice } from '@/components/backoffice';

const PRIVACY_EMAIL = 'privacy@escoltapro.mx';

interface PolicySection {
  title: string;
  body?: string[];
  bullets?: string[];
  // Nota para revision legal (se muestra resaltada mientras sea plantilla)
  counsel?: string;
}

// El texto (plantilla pendiente de revision legal) vive en
// i18n/locales/{en,es}/account.ts → policy.sections. Aqui solo el orden.
const SECTION_ORDER = [
  'responsible',
  'collect',
  'purposes',
  'optional',
  'sharing',
  'documents',
  'retention',
  'arco',
  'storage',
  'security',
  'changes',
  'complaints',
] as const;

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation('account');
  // returnObjects interpola cada cadena anidada ({{email}}).
  const all = t('policy.sections', { returnObjects: true, email: PRIVACY_EMAIL }) as unknown as Record<
    (typeof SECTION_ORDER)[number],
    PolicySection
  >;
  const sections = SECTION_ORDER.map((id) => ({ id, ...all[id] }));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavBar title={t('policy.navTitle')} />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.header}>
          <Badge label={t('policy.badge')} tone="warning" />
          <AppText variant="title1" accessibilityRole="header">
            {t('policy.title')}
          </AppText>
          <AppText variant="callout">{t('policy.intro')}</AppText>
        </View>

        <Notice
          tone="warning"
          title={t('policy.draftTitle')}
          message={t('policy.draftMessage')}
        />

        {sections.map((section, index) => (
          <View key={section.id} style={styles.section}>
            {index > 0 ? <Divider style={styles.divider} /> : null}
            <AppText variant="title3" accessibilityRole="header">
              {section.title}
            </AppText>
            {section.body?.map((p) => (
              <AppText key={p} variant="body" color={Colors.textSecondary}>
                {p}
              </AppText>
            ))}
            {section.bullets ? (
              <View style={styles.bullets}>
                {section.bullets.map((b) => (
                  <View key={b} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <AppText variant="body" color={Colors.textSecondary} style={styles.bulletText}>
                      {b}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}
            {section.counsel ? (
              <AppText variant="caption" color={Colors.warning}>
                {t('policy.counselPrefix', { note: section.counsel })}
              </AppText>
            ) : null}
          </View>
        ))}

        <Button
          title={t('policy.emailButton', { email: PRIVACY_EMAIL })}
          icon={Mail}
          variant="outline"
          onPress={() => openContact(`mailto:${PRIVACY_EMAIL}`).catch(() => {})}
          style={styles.contact}
        />
        <AppText variant="caption" color={Colors.textTertiary} align="center" style={styles.footer}>
          {t('policy.lastUpdated')}
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
  header: {
    gap: Space.md,
    marginBottom: Space.xl,
  },
  section: {
    gap: Space.md,
    marginTop: Space.xl,
  },
  divider: {
    marginBottom: Space.md,
  },
  bullets: {
    gap: Space.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 9,
  },
  bulletText: {
    flex: 1,
  },
  contact: {
    marginTop: Space.xxxl,
  },
  footer: {
    marginTop: Space.lg,
  },
});
