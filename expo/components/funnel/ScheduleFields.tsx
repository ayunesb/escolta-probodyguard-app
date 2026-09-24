import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Button, PressableScale } from '@/components/ui';
import { WebTimeField } from './WebTimeField';
import { WebDateField } from './WebDateField';
import { formatDateLong, formatTime } from './format';

export interface ScheduleFieldsProps {
  // Local start date + time of the booking.
  value: Date;
  onChange: (next: Date) => void;
  error?: string | null;
}

// Accessible web date/time dialogs and platform pickers on iOS/Android.
// Everything uses the local calendar date and wall-clock time.
export function ScheduleFields({ value, onChange, error }: ScheduleFieldsProps) {
  const { t } = useTranslation(['funnel', 'common']);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const borderColor = error ? Colors.error : Colors.border;

  const setDatePart = (y: number, m: number, d: number) => {
    const next = new Date(value);
    next.setFullYear(y, m, d);
    onChange(next);
  };
  const setTimePart = (h: number, min: number) => {
    const next = new Date(value);
    next.setHours(h, min, 0, 0);
    onChange(next);
  };

  if (Platform.OS === 'web') {
    return (
      <View>
        <View style={styles.row}>
          {/* Each web control includes its own icon and accessible dialog. */}
          <FieldShell label={t('schedule.date')} icon={Calendar} borderColor={borderColor} compact>
            <WebDateField value={value} onChange={onChange} />
          </FieldShell>
          <FieldShell label={t('schedule.startTime')} icon={Clock} borderColor={borderColor} compact>
            <WebTimeField value={value} onChange={onChange} />
          </FieldShell>
        </View>
        <FieldError error={error} />
      </View>
    );
  }

  const handleNative = (mode: 'date' | 'time') => (event: DateTimePickerEvent, selected?: Date) => {
    // Android closes its dialog on any outcome; iOS keeps the inline spinner.
    if (Platform.OS !== 'ios') setPicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (mode === 'date') setDatePart(selected.getFullYear(), selected.getMonth(), selected.getDate());
    else setTimePart(selected.getHours(), selected.getMinutes());
  };

  return (
    <View>
      <View style={styles.row}>
        <FieldShell
          label={t('schedule.date')}
          icon={Calendar}
          borderColor={picker === 'date' ? Colors.accentLine : borderColor}
          onPress={() => setPicker(picker === 'date' ? null : 'date')}
          accessibilityLabel={t('schedule.dateValueA11y', { date: formatDateLong(value) })}
        >
          <AppText variant="body" style={styles.value}>
            {formatDateLong(value)}
          </AppText>
        </FieldShell>
        <FieldShell
          label={t('schedule.startTime')}
          icon={Clock}
          borderColor={picker === 'time' ? Colors.accentLine : borderColor}
          onPress={() => setPicker(picker === 'time' ? null : 'time')}
          accessibilityLabel={t('schedule.timeValueA11y', { time: formatTime(value) })}
        >
          <AppText variant="body" style={styles.value}>
            {formatTime(value)}
          </AppText>
        </FieldShell>
      </View>
      <FieldError error={error} />

      {picker ? (
        <View style={Platform.OS === 'ios' ? styles.inlinePicker : null}>
          <DateTimePicker
            value={value}
            mode={picker}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={picker === 'date' ? new Date() : undefined}
            onChange={handleNative(picker)}
            themeVariant="dark"
            textColor={Colors.textPrimary}
            accentColor={Colors.accent}
          />
          {Platform.OS === 'ios' ? (
            <Button title={t('common:actions.done')} variant="ghost" size="sm" fullWidth={false} onPress={() => setPicker(null)} style={styles.done} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FieldShell({
  label,
  icon: Icon,
  borderColor,
  onPress,
  accessibilityLabel,
  compact,
  children,
}: {
  label: string;
  icon: LucideIcon;
  borderColor: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  // Web: the browser input brings its own picker icon, so no leading icon and tighter padding.
  compact?: boolean;
  children: React.ReactNode;
}) {
  const field = (
    <View style={[styles.field, compact ? styles.fieldCompact : null, { borderColor }]}>
      {compact ? null : <Icon size={18} color={Colors.textTertiary} strokeWidth={ICON_STROKE} style={styles.icon} />}
      {children}
    </View>
  );
  return (
    <View style={styles.cell}>
      <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
      {onPress ? (
        <PressableScale onPress={onPress} scaleTo={0.985} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
          {field}
        </PressableScale>
      ) : (
        field
      )}
    </View>
  );
}

function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <AppText variant="caption" color={Colors.error} style={styles.error} accessibilityLiveRegion="polite">
      {error}
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Space.md,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    marginBottom: Space.sm,
    letterSpacing: 0.1,
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  fieldCompact: {
    gap: Space.sm,
    paddingHorizontal: Space.md,
  },
  icon: {
    flexShrink: 0,
  },
  value: {
    flex: 1,
  },
  error: {
    marginTop: Space.sm,
  },
  inlinePicker: {
    marginTop: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  done: {
    alignSelf: 'flex-end',
    margin: Space.sm,
  },
});
