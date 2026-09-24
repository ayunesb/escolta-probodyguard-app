import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Building2, Check, Lock, Mail, MailCheck, Phone, Shield, UserRound, BriefcaseBusiness, CircleAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { validatePasswordStrength } from '@/utils/passwordValidation';
import type { UserRole } from '@/types';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Button, EmptyState, Input, NavBar, PressableScale, Screen, SectionTitle } from '@/components/ui';

type SignUpRole = Exclude<UserRole, 'admin'>;

// Las cuentas de administrador no se crean desde la app.
const ROLES: { value: SignUpRole; title: string; description: string; icon: LucideIcon }[] = [
  { value: 'client', title: 'I need protection', description: 'Book vetted protectors for yourself, family or guests.', icon: Shield },
  { value: 'guard', title: "I'm a protector", description: 'Offer close protection and receive jobs.', icon: BriefcaseBusiness },
  { value: 'company', title: 'I run a security firm', description: 'Manage your roster and their bookings.', icon: Building2 },
];

type Consents = { terms: boolean; privacy: boolean; dataProcessing: boolean; marketing: boolean };

function RoleOption({ option, selected, onPress }: { option: (typeof ROLES)[number]; selected: boolean; onPress: () => void }) {
  const Icon = option.icon;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      haptic="selection"
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.title}
      hoverStyle={selected ? undefined : { borderColor: Colors.borderStrong }}
      style={[styles.roleOption, selected ? styles.roleOptionSelected : null]}
    >
      <View style={[styles.roleIcon, selected ? styles.roleIconSelected : null]}>
        <Icon size={18} color={selected ? Colors.textOnGold : Colors.gold} strokeWidth={ICON_STROKE} />
      </View>
      <View style={styles.roleText}>
        <AppText variant="headline">{option.title}</AppText>
        <AppText variant="footnote">{option.description}</AppText>
      </View>
      <View style={[styles.radio, selected ? styles.radioOn : null]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </PressableScale>
  );
}

function CheckRow({ checked, onToggle, children, label }: { checked: boolean; onToggle: () => void; children: React.ReactNode; label: string }) {
  return (
    <PressableScale
      onPress={onToggle}
      scaleTo={0.99}
      haptic="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={styles.checkRow}
    >
      <View style={[styles.checkbox, checked ? styles.checkboxOn : null]}>
        {checked ? <Check size={14} color={Colors.textOnGold} strokeWidth={2.5} /> : null}
      </View>
      <View style={styles.checkText}>{children}</View>
    </PressableScale>
  );
}

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<SignUpRole>('client');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [consents, setConsents] = useState<Consents>({ terms: false, privacy: false, dataProcessing: false, marketing: false });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const strength = useMemo(() => (password ? validatePasswordStrength(password) : null), [password]);
  const toggle = (key: keyof Consents) => setConsents((c) => ({ ...c, [key]: !c[key] }));
  const clearError = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const handleSignUp = async () => {
    const data = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() };
    const next: Record<string, string> = {};
    if (!data.firstName) next.firstName = 'Required';
    if (!data.lastName) next.lastName = 'Required';
    if (!data.email) next.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(data.email)) next.email = "That email address isn't valid.";
    if (!data.phone) next.phone = 'Enter a phone number we can reach you on.';
    else if (data.phone.replace(/\D/g, '').length < 10) next.phone = 'Include the full number with area code.';
    if (!password) next.password = 'Choose a password.';
    else if (strength && !strength.isValid) next.password = strength.feedback.join(' · ');
    if (!consents.terms || !consents.privacy || !consents.dataProcessing) next.consents = 'Please accept the required items above.';
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setIsLoading(true);
    const result = await signUp(data.email, password, data.firstName, data.lastName, data.phone, role, consents);
    setIsLoading(false);
    if (result.success) {
      setSentTo(data.email);
    } else {
      setFormError(result.error || "We couldn't create your account.");
    }
  };

  if (sentTo) {
    return (
      <Screen glow padBottom contentStyle={styles.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState
          icon={MailCheck}
          title="Check your inbox"
          message={`We sent a verification link to ${sentTo}. Open it to activate your account, then sign in.`}
        />
        <Button title="Back to sign in" onPress={() => router.replace('/auth/sign-in')} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <NavBar title="Create account" transparent />
      <Screen keyboard padTop={false} padBottom contentStyle={styles.content}>
        <AppText variant="title1" accessibilityRole="header">
          Join Escolta Pro
        </AppText>
        <AppText variant="callout" style={styles.lead}>
          Tell us how you’ll use the service. You can complete your profile after verifying your email.
        </AppText>

        <SectionTitle title="Account type" />
        <View style={styles.roles} accessibilityRole="radiogroup">
          {ROLES.map((option) => (
            <RoleOption key={option.value} option={option} selected={role === option.value} onPress={() => setRole(option.value)} />
          ))}
        </View>

        <SectionTitle title="Your details" />
        <View style={styles.fields}>
          <View style={styles.row}>
            <Input
              containerStyle={styles.half}
              label="First name"
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                clearError('firstName');
              }}
              placeholder="Sofía"
              autoCapitalize="words"
              autoComplete="given-name"
              error={errors.firstName}
            />
            <Input
              containerStyle={styles.half}
              label="Last name"
              value={lastName}
              onChangeText={(t) => {
                setLastName(t);
                clearError('lastName');
              }}
              placeholder="Márquez"
              autoCapitalize="words"
              autoComplete="family-name"
              error={errors.lastName}
            />
          </View>
          <Input
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={(t) => {
              setEmail(t.trim());
              clearError('email');
            }}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            error={errors.email}
          />
          <Input
            label="Mobile phone"
            icon={Phone}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clearError('phone');
            }}
            placeholder="+52 55 1234 5678"
            keyboardType="phone-pad"
            autoComplete="tel"
            error={errors.phone}
          />
          <Input
            label="Password"
            icon={Lock}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearError('password');
            }}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.password}
            hint={strength ? (strength.isValid ? 'Strong password' : strength.feedback[0]) : 'Use 8+ characters with a mix of letters, numbers and symbols.'}
          />
        </View>

        <SectionTitle title="Agreements" />
        <View style={styles.consents}>
          <CheckRow checked={consents.terms} onToggle={() => toggle('terms')} label="Accept the Terms of Service">
            <AppText variant="callout" color={Colors.textPrimary}>
              I accept the Terms of Service <AppText variant="callout" color={Colors.textTertiary}>(required)</AppText>
            </AppText>
          </CheckRow>
          <CheckRow checked={consents.privacy} onToggle={() => toggle('privacy')} label="Accept the Privacy Policy">
            <AppText variant="callout" color={Colors.textPrimary}>
              I accept the{' '}
              <AppText variant="callout" color={Colors.gold} onPress={() => router.push('/privacy-policy' as never)} accessibilityRole="link">
                Privacy Policy
              </AppText>{' '}
              <AppText variant="callout" color={Colors.textTertiary}>(required)</AppText>
            </AppText>
          </CheckRow>
          <CheckRow checked={consents.dataProcessing} onToggle={() => toggle('dataProcessing')} label="Consent to data processing">
            <AppText variant="callout" color={Colors.textPrimary}>
              I consent to my data being processed to deliver the service{' '}
              <AppText variant="callout" color={Colors.textTertiary}>(required)</AppText>
            </AppText>
          </CheckRow>
          <CheckRow checked={consents.marketing} onToggle={() => toggle('marketing')} label="Receive occasional updates">
            <AppText variant="callout" color={Colors.textPrimary}>
              Send me occasional updates <AppText variant="callout" color={Colors.textTertiary}>(optional)</AppText>
            </AppText>
          </CheckRow>
          {errors.consents ? (
            <AppText variant="caption" color={Colors.error}>
              {errors.consents}
            </AppText>
          ) : null}
        </View>

        {formError ? (
          <View style={styles.formError} accessibilityRole="alert">
            <CircleAlert size={17} color={Colors.error} strokeWidth={ICON_STROKE} />
            <AppText variant="footnote" color={Colors.textPrimary} style={styles.flex}>
              {formError}
            </AppText>
          </View>
        ) : null}

        <Button title="Create account" size="lg" onPress={handleSignUp} loading={isLoading} icon={UserRound} style={styles.submit} />
        <Button title="I already have an account" variant="ghost" onPress={() => router.replace('/auth/sign-in')} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    gap: Space.xl,
  },
  content: {
    paddingTop: Space.lg,
  },
  lead: {
    marginTop: Space.sm,
  },
  roles: {
    gap: Space.sm,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleOptionSelected: {
    borderColor: Colors.goldLine,
    backgroundColor: Colors.surfaceLight,
  },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.goldSoft,
  },
  roleIconSelected: {
    backgroundColor: Colors.gold,
  },
  roleText: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: Colors.gold,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
  },
  fields: {
    gap: Space.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Space.md,
  },
  half: {
    flex: 1,
  },
  consents: {
    gap: Space.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  checkText: {
    flex: 1,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    marginTop: Space.xl,
    borderRadius: Radius.sm,
    backgroundColor: Colors.errorSoft,
  },
  submit: {
    marginTop: Space.xxl,
    marginBottom: Space.sm,
  },
});
