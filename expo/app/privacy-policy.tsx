import { Linking, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
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

// PLANTILLA. Redactada en lenguaje claro para un marketplace mexicano de
// proteccion ejecutiva. Debe revisarla un abogado antes de publicarse: los
// corchetes marcan lo que falta confirmar.
const SECTIONS: PolicySection[] = [
  {
    title: '1. Who is responsible for your data',
    body: [
      `Escolta Pro ([legal entity name], [registered address], Mexico) is responsible for the personal data you give us through the Escolta Pro app and website. For anything related to your privacy, write to ${PRIVACY_EMAIL}.`,
    ],
    counsel: 'Complete the legal entity, address and the name of the data protection officer or department.',
  },
  {
    title: '2. What we collect',
    bullets: [
      'Account: your name, email, phone number, preferred language and account type (client, guard or company).',
      'Guards: profile and outfit photos, government ID, security license, insurance and vehicle documents, hourly rate, availability, ratings and completed jobs.',
      'Security companies: company name and the guards on your team.',
      'Bookings: pickup and destination addresses, dates and times, service options, amounts, ratings and reviews, and messages between the client and the guard.',
      'Location: your device location while a booking is in progress (a guard’s live position is shared with their client) and when you send an emergency alert.',
      'Payments: processed by Stripe. We receive a payment reference, the amount and its status — never your full card number.',
      'Emergency alerts: the time, type of alert, the related booking and your location if your device shares it.',
      'Technical data: device type, app version and error reports that help us keep the service working.',
    ],
  },
  {
    title: '3. Why we use it',
    body: ['We use your data to provide the service you ask for (primary purposes):'],
    bullets: [
      'Create and secure your account.',
      'Verify the identity and credentials of guards before they can accept bookings.',
      'Book, schedule and carry out protection services, including live location during a job.',
      'Charge for bookings and pay guards and companies.',
      'Respond to emergency alerts and safety incidents.',
      'Provide support and resolve disputes.',
      'Meet legal, tax and accounting obligations and prevent fraud.',
    ],
  },
  {
    title: '4. Optional uses',
    body: [
      'With your permission we may also send you news and offers. This is off by default, you can change it any time in Profile → Privacy & data, and saying no never affects the service.',
    ],
    counsel: 'List any analytics or advertising tools in use and whether they require consent.',
  },
  {
    title: '5. Who we share it with',
    body: ['We share only what each party needs, and we do not sell your personal data.'],
    bullets: [
      'The other side of your booking: a client sees the guard’s name, photo, rating and live location during the job; the guard sees the client’s name, pickup address and messages.',
      'The security company a guard works for, which manages that guard’s profile and documents.',
      'Providers that run the service on our behalf, under contract: Google Firebase (hosting, database and file storage) and Stripe (payments). Some of them store data outside Mexico.',
      'Authorities, when the law requires it or to protect someone’s life or safety in an emergency.',
    ],
    counsel: 'Confirm the list of processors, international transfers and whether any transfer needs your consent.',
  },
  {
    title: '6. Identity documents',
    body: [
      'Government IDs, security licenses, insurance and vehicle documents are private. Only the guard, the guard’s company and Escolta Pro reviewers can open them. They are never shown to clients.',
    ],
    counsel: 'Confirm whether any data processed is “sensitive” under the LFPDPPP and, if so, how express consent is collected.',
  },
  {
    title: '7. How long we keep it',
    bullets: [
      'Account data: while your account is open.',
      'After you ask us to delete your account: we delete your personal data within 30 days, except records we must keep by law.',
      'Booking, payment and invoicing records: for the period tax law requires (generally five years).',
      'Verification documents: while the guard is active, then [retention period].',
      'Location recorded during jobs and emergency alerts: [retention period].',
    ],
    counsel: 'Define the bracketed retention periods and confirm the tax retention period.',
  },
  {
    title: '8. Your ARCO rights',
    body: [
      'You can Access your data, Rectify it if it is wrong, Cancel it (ask us to delete it) and Oppose specific uses. You can also withdraw a consent you gave us.',
      `To make a request, email ${PRIVACY_EMAIL} with your full name, the email on your account, a copy of your ID (or your representative’s, with proof of representation) and a clear description of what you want. We answer within 20 business days and, if your request is granted, carry it out within the following 15 business days.`,
      'You can also download a copy of your data and request account deletion yourself in Profile → Privacy & data.',
    ],
    counsel: 'Confirm response periods and requirements against the LFPDPPP in force.',
  },
  {
    title: '9. Browser storage',
    body: [
      'The web version keeps you signed in and remembers your preferences using your browser’s storage. We do not use advertising cookies.',
    ],
    counsel: 'Confirm with engineering the complete list of cookies and similar technologies.',
  },
  {
    title: '10. How we protect it',
    body: [
      'Data travels encrypted, access is limited by role (for example, only reviewers can see identity documents) and every document upload and verification decision is logged.',
    ],
  },
  {
    title: '11. Changes to this notice',
    body: [
      'If we change this notice we will publish the new version here and tell you in the app before important changes take effect.',
    ],
  },
  {
    title: '12. If you have a complaint',
    body: [
      `Write to us first at ${PRIVACY_EMAIL}. If you believe your rights have not been respected, you can go to the Mexican federal authority responsible for personal data protection.`,
    ],
    counsel: 'Name the competent authority and its contact details after the 2025 reform of the LFPDPPP.',
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavBar title="Privacy policy" />
      <Screen padTop={false} contentStyle={styles.content}>
        <View style={styles.header}>
          <Badge label="Template · pending legal review" tone="warning" />
          <AppText variant="title1" accessibilityRole="header">
            Privacy notice
          </AppText>
          <AppText variant="callout">
            How Escolta Pro collects, uses and protects your personal data, under Mexico’s Federal Law on the Protection of
            Personal Data Held by Private Parties (LFPDPPP).
          </AppText>
        </View>

        <Notice
          tone="warning"
          title="Draft for counsel"
          message="This notice is a template. It has not been reviewed by a lawyer and is not yet in force. Highlighted items must be completed before launch."
        />

        {SECTIONS.map((section, index) => (
          <View key={section.title} style={styles.section}>
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
                For counsel: {section.counsel}
              </AppText>
            ) : null}
          </View>
        ))}

        <Button
          title={`Email ${PRIVACY_EMAIL}`}
          icon={Mail}
          variant="outline"
          onPress={() => Linking.openURL(`mailto:${PRIVACY_EMAIL}`).catch(() => {})}
          style={styles.contact}
        />
        <AppText variant="caption" color={Colors.textTertiary} align="center" style={styles.footer}>
          Last updated: not yet published.
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
