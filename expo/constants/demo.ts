// Opt-in at build time. Never enables the public demo for native builds.
import { Platform } from 'react-native';
export const PUBLIC_DEMO = Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEMO_MODE === '1';
