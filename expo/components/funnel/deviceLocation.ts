import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { logger } from '@/utils/logger';
import { PUBLIC_DEMO } from '@/constants/demo';

export type Coords = { latitude: number; longitude: number };

const valid = (c: { latitude?: number; longitude?: number } | null | undefined): c is Coords =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);

/**
 * Current device position. With `prompt: false` it never shows a permission
 * dialog (it only reads a location the user already allowed) — used for
 * optional niceties like distances. Returns null when unavailable.
 */
export async function getDeviceCoords({ prompt }: { prompt: boolean }): Promise<Coords | null> {
  if (PUBLIC_DEMO) return null;
  try {
    const perm = prompt
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last && valid(last.coords)) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return valid(current.coords) ? { latitude: current.coords.latitude, longitude: current.coords.longitude } : null;
  } catch (error) {
    logger.warn('[Location] Device position unavailable', { error: String(error) });
    return null;
  }
}

/** Device position without prompting (null until/unless already permitted). */
export function useSilentDeviceLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDeviceCoords({ prompt: false }).then((c) => {
      if (!cancelled) setCoords(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return coords;
}

/**
 * Geocodes a typed address. expo-location has no geocoder on web (it returns
 * []), so on web this resolves null and callers fall back — visibly.
 */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const results = await Location.geocodeAsync(query);
    const first = results?.find((r) => valid(r));
    return first ? { latitude: first.latitude, longitude: first.longitude } : null;
  } catch (error) {
    logger.warn('[Location] Geocoding failed', { error: String(error) });
    return null;
  }
}
