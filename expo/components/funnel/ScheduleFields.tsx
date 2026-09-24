import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Fonts, ICON_STROKE, Radius, Space } from '@/constants/design';
import { AppText, Button, PressableScale } from '@/components/ui';
import { formatDateLong, formatTime, toDateInputValue, toTimeInputValue } from './format';

export interface ScheduleFieldsProps {
  // Local start date + time of the booking.
  value: Date;
  onChange: (next: Date) => void;
  error?: string | null;
}

// Native <input type="date|time"> on web (the community picker has no web
// implementation), platform pickers on iOS/Android. Everything is LOCAL time.
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
    const inputStyle: CSSProperties = {
      flex: 1,
      minWidth: 0,
      fontSize: 15.5,
      fontFamily: Fonts.regular,
      color: Colors.textPrimary,
      backgroundColor: 'transparent',
      border: 'none',
      outline: 'none',
      colorScheme: 'dark',
      padding: '14px 0',
    };
    return (
      <View>
        <View style={styles.row}>
          {/* Browser inputs draw their own picker icon, so the shell drops its
              duplicate one and pads tighter: at 375 px both values used to clip. */}
          <FieldShell label={t('schedule.date')} icon={Calendar} borderColor={borderColor} compact>
            <input
              type="date"
              aria-label={t('schedule.dateA11y')}
              value={toDateInputValue(value)}
              min={toDateInputValue(new Date())}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                if (y && m && d) setDatePart(y, m - 1, d);
              }}
              style={inputStyle}
            />
          </FieldShell>
          <FieldShell label={t('schedule.startTime')} icon={Clock} borderColor={borderColor} compact>
            <input
              type="time"
              aria-label={t('schedule.startTime')}
              value={toTimeInputValue(value)}
              onChange={(e) => {
                const [h, min] = e.target.value.split(':').map(Number);
                if (!Number.isNaN(h) && !Number.isNaN(min)) setTimePart(h, min);
              }}
              style={inputStyle}
            />
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
