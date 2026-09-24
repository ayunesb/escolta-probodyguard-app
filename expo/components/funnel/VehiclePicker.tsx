import React from 'react';
import { Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Radius, Space } from '@/constants/design';
import { BrandImages } from '@/constants/brandMedia';
import { AppText, PressableScale } from '@/components/ui';
import { fillImage } from '@/components/ui/Media';
import type { VehicleType } from '@/types';
import { PRICING } from '@/utils/pricing';

const pct = (multiplier: number) => `${Math.round((multiplier - 1) * 100)}%`;

const OPTIONS: { value: VehicleType; label: string; line: string; image: ImageSourcePropType }[] = [
  {
    value: 'standard',
    label: 'Standard',
    line: 'Executive sedan or SUV.',
    image: BrandImages.vehicles.standard,
  },
  {
    value: 'armored',
    label: `Armored · +${pct(PRICING.ARMORED_VEHICLE_MULTIPLIER)}`,
    line: 'Ballistic-rated, with a trained driver.',
    image: BrandImages.vehicles.armored,
  },
];

export interface VehiclePickerProps {
  value: VehicleType;
  onChange: (value: VehicleType) => void;
}

// Two photo tiles side by side. Selected: ice-blue edge, check badge, white
// label. The other one steps back (dimmed photo, secondary label).
export function VehiclePicker({ value, onChange }: VehiclePickerProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            scaleTo={0.97}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={opt.label}
            accessibilityHint={opt.line}
            hoverStyle={selected ? undefined : styles.hover}
            style={[styles.tile, selected ? styles.tileSelected : null]}
          >
            <View style={styles.media}>
              <Image
                source={opt.image}
                style={[fillImage, selected ? null : styles.imageDim]}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <View style={[styles.check, selected ? styles.checkOn : styles.checkOff]}>
                {selected ? <Check size={13} color={Colors.textOnAccent} strokeWidth={2.75} /> : null}
              </View>
            </View>
            <View style={styles.body}>
              <AppText variant="headline" color={selected ? Colors.white : Colors.textSecondary} numberOfLines={1}>
                {opt.label}
              </AppText>
              <AppText variant="footnote" color={Colors.textTertiary} numberOfLines={2}>
                {opt.line}
              </AppText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Space.md,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: Radius.lg,
    backgroundColor: Colors.glass,
    borderWidth: 1.5,
    borderColor: Colors.glassBorder,
  },
  tileSelected: {
    backgroundColor: Colors.glassStrong,
    borderColor: Colors.accentLine,
  },
  hover: {
    borderColor: Colors.accentLine,
  },
  media: {
    height: 100,
    backgroundColor: Colors.surface,
  },
  imageDim: {
    opacity: 0.5,
  },
  check: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: Colors.accent,
  },
  checkOff: {
    backgroundColor: Colors.overlay,
    borderWidth: 1.5,
    borderColor: Colors.glassBorder,
  },
  body: {
    padding: Space.md,
    gap: 2,
  },
});
