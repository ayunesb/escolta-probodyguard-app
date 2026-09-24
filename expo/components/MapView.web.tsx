/**
 * Mapa para web con Leaflet (empaquetado, no de un CDN) y teselas oscuras de
 * CARTO sobre datos de OpenStreetMap, a juego con el tema de la app.
 *
 * Expone la misma forma que react-native-maps en lo que esta app usa:
 * - MapView: initialRegion / region, onPress (e.nativeEvent.coordinate) y un
 *   ref con fitToCoordinates() y animateToRegion().
 * - Marker: coordinate, title, description, onPress. Si trae children (Views
 *   de RN) se pintan dentro del marcador con un portal, igual que en nativo;
 *   si no, un punto dorado.
 * - Polyline: coordinates, strokeColor, strokeWidth, lineDashPattern.
 */
import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type * as LeafletNS from 'leaflet';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/design';
import 'leaflet/dist/leaflet.css';

type Leaflet = typeof LeafletNS;

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Region extends LatLng {
  latitudeDelta?: number;
  longitudeDelta?: number;
}

export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapViewHandle {
  fitToCoordinates: (coordinates: LatLng[], options?: { edgePadding?: EdgePadding; animated?: boolean }) => void;
  animateToRegion: (region: Region, duration?: number) => void;
}

export type MapPressEvent = { nativeEvent: { coordinate: LatLng } };

interface MapViewOwnProps {
  initialRegion?: Region;
  region?: Region;
  onPress?: (e: MapPressEvent) => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}

// Props solo nativas (provider, showsUserLocation...) se aceptan y se ignoran.
export type MapViewProps = MapViewOwnProps & { [key: string]: unknown };

export interface MarkerProps {
  coordinate: LatLng;
  title?: string;
  description?: string;
  onPress?: (e: MapPressEvent) => void;
  children?: React.ReactNode;
  zIndex?: number;
  [key: string]: unknown;
}

export interface PolylineProps {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  [key: string]: unknown;
}

// react-dom esta disponible en web (react-native-web lo usa), pero el
// proyecto no trae sus tipos; basta con esta firma.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createPortal } = require('react-dom') as {
  createPortal: (children: React.ReactNode, container: Element) => React.ReactPortal;
};

// Teselas: por defecto OpenStreetMap oscurecido con un filtro CSS (CARTO ya
// exige llave y pintaba "API KEY REQUIRED" encima del mapa). Para produccion
// conviene un proveedor con contrato (MapTiler, Stadia, Mapbox): se configura
// con EXPO_PUBLIC_MAP_TILE_URL (+ EXPO_PUBLIC_MAP_TILE_ATTRIBUTION) y, si ese
// estilo ya es oscuro, el filtro no se aplica.
const CUSTOM_TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL;
const TILE_URL = CUSTOM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARKEN_TILES = !CUSTOM_TILE_URL;
const ATTRIBUTION =
  process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const DEFAULT_CENTER: Region = { latitude: 19.4326, longitude: -99.1332, latitudeDelta: 0.05 };

interface MapContextValue {
  L: Leaflet;
  map: LeafletNS.Map;
}

const MapContext = createContext<MapContextValue | null>(null);

const isValid = (c?: Partial<LatLng> | null): c is LatLng =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);

// "delta" de react-native-maps -> nivel de zoom de Leaflet.
function zoomFromDelta(delta?: number): number {
  if (!delta || delta <= 0) return 15;
  return Math.max(3, Math.min(18, Math.round(Math.log2(360 / delta))));
}

async function loadLeaflet(): Promise<Leaflet> {
  const mod = await import('leaflet');
  return ((mod as unknown as { default?: Leaflet }).default ?? mod) as Leaflet;
}

// Controles y tooltips de Leaflet con los colores del tema (vienen blancos).
let stylesInjected = false;
function injectMapStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.setAttribute('data-escolta-map', '');
  el.textContent = `
.leaflet-container{background:${Colors.background};font-family:${Fonts.medium},system-ui,sans-serif;outline:none}
.escolta-dark-tiles{filter:invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.3)}
.leaflet-control-attribution{background:${Colors.overlay}!important;color:${Colors.textTertiary}!important;font-size:10px;padding:1px 6px!important}
.leaflet-control-attribution a{color:${Colors.textSecondary}!important}
.leaflet-bar{border:1px solid ${Colors.border}!important;box-shadow:none!important;border-radius:10px!important;overflow:hidden}
.leaflet-bar a,.leaflet-bar a:hover{background:${Colors.surface}!important;color:${Colors.textPrimary}!important;border-bottom-color:${Colors.border}!important}
.leaflet-tooltip{background:${Colors.surface};color:${Colors.textPrimary};border:1px solid ${Colors.borderStrong};border-radius:8px;box-shadow:none;font-size:12px}
.leaflet-tooltip-top:before{border-top-color:${Colors.borderStrong}}
.escolta-marker{background:transparent;border:0}
`;
  document.head.appendChild(el);
}

const DEFAULT_PIN_HTML =
  `<div style="position:absolute;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:9px;` +
  `background:${Colors.accent};border:3px solid ${Colors.background};box-shadow:0 0 0 1px ${Colors.accentLine}"></div>`;
const HOST_HTML = '<div class="escolta-marker-host" style="position:absolute;transform:translate(-50%,-50%)"></div>';

const MapViewImpl = forwardRef<MapViewHandle, MapViewOwnProps>(function MapView(
  { initialRegion, region, onPress, style, children, accessibilityLabel },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<MapContextValue | null>(null);
  const [ctx, setCtx] = useState<MapContextValue | null>(null);
  const pendingFitRef = useRef<(() => void) | null>(null);
  const onPressRef = useRef(onPress);
  const center = region ?? initialRegion ?? DEFAULT_CENTER;
  const lastCenterRef = useRef<LatLng>({ latitude: center.latitude, longitude: center.longitude });

  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletNS.Map | null = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;
      injectMapStyles();
      const start = lastCenterRef.current;
      map = L.map(containerRef.current, {
        center: [start.latitude, start.longitude],
        zoom: zoomFromDelta(center.latitudeDelta),
        zoomControl: true,
        attributionControl: true,
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer(TILE_URL, {
        attribution: ATTRIBUTION,
        maxZoom: 19,
        className: DARKEN_TILES ? 'escolta-dark-tiles' : undefined,
      }).addTo(map);
      map.on('click', (e: LeafletNS.LeafletMouseEvent) => {
        onPressRef.current?.({ nativeEvent: { coordinate: { latitude: e.latlng.lat, longitude: e.latlng.lng } } });
      });

      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map?.invalidateSize());
        observer.observe(containerRef.current);
      }

      const value = { L, map };
      ctxRef.current = value;
      setCtx(value);

      // El contenedor suele montarse con alto 0; sin esto el mapa sale gris.
      setTimeout(() => {
        if (cancelled) return;
        map?.invalidateSize();
        const pending = pendingFitRef.current;
        pendingFitRef.current = null;
        pending?.();
      }, 0);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      ctxRef.current = null;
      map?.remove();
    };
    // Solo al montar: los cambios de centro se siguen en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el centro cambia desde fuera, se mueve el mapa (no en el primer render).
  const centerLat = center.latitude;
  const centerLng = center.longitude;
  useEffect(() => {
    const current = ctxRef.current;
    const last = lastCenterRef.current;
    if (last.latitude === centerLat && last.longitude === centerLng) return;
    lastCenterRef.current = { latitude: centerLat, longitude: centerLng };
    if (current && isValid({ latitude: centerLat, longitude: centerLng })) {
      current.map.setView([centerLat, centerLng], current.map.getZoom(), { animate: true });
    }
  }, [centerLat, centerLng]);

  useImperativeHandle(
    ref,
    () => ({
      fitToCoordinates(coordinates, options) {
        const run = () => {
          const current = ctxRef.current;
          if (!current) return;
          const points = coordinates.filter(isValid);
          if (points.length === 0) return;
          const animate = options?.animated ?? true;
          if (points.length === 1) {
            current.map.setView([points[0].latitude, points[0].longitude], Math.max(current.map.getZoom(), 15), { animate });
            return;
          }
          const pad = options?.edgePadding;
          current.map.fitBounds(
            current.L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])),
            {
              paddingTopLeft: [pad?.left ?? 48, pad?.top ?? 48],
              paddingBottomRight: [pad?.right ?? 48, pad?.bottom ?? 48],
              animate,
              maxZoom: 16,
            }
          );
        };
        if (ctxRef.current) run();
        else pendingFitRef.current = run;
      },
      animateToRegion(target, duration = 500) {
        const current = ctxRef.current;
        if (!current || !isValid(target)) return;
        current.map.setView([target.latitude, target.longitude], zoomFromDelta(target.latitudeDelta), {
          animate: true,
          duration: duration / 1000,
        });
      },
    }),
    []
  );

  return (
    <View style={[styles.container, style]} accessibilityLabel={accessibilityLabel}>
      <div ref={containerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
      <MapContext.Provider value={ctx}>{children}</MapContext.Provider>
    </View>
  );
});

export function Marker({ coordinate, title, description, onPress, children, zIndex }: MarkerProps) {
  const ctx = useContext(MapContext);
  const markerRef = useRef<LeafletNS.Marker | null>(null);
  const coordRef = useRef(coordinate);
  const onPressRef = useRef(onPress);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const hasChildren = React.Children.count(children) > 0;
  const valid = isValid(coordinate);

  useEffect(() => {
    coordRef.current = coordinate;
    onPressRef.current = onPress;
  });

  useEffect(() => {
    if (!ctx || !valid) return;
    const { L, map } = ctx;
    const start = coordRef.current;
    const marker = L.marker([start.latitude, start.longitude], {
      icon: L.divIcon({
        className: 'escolta-marker',
        html: hasChildren ? HOST_HTML : DEFAULT_PIN_HTML,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      title: title ?? '',
      alt: title ?? '',
      keyboard: !!onPressRef.current,
      riseOnHover: true,
      zIndexOffset: zIndex ?? 0,
    });
    marker.on('click', () => {
      onPressRef.current?.({ nativeEvent: { coordinate: coordRef.current } });
    });
    if (title || description) {
      // Texto como nodo, nunca como HTML: puede traer nombres de usuarios.
      const tip = document.createElement('div');
      tip.textContent = [title, description].filter(Boolean).join(' · ');
      marker.bindTooltip(tip, { direction: 'top', offset: [0, -20] });
    }
    // Si el mapa se desmonto y se esta recreando (recarga, cambio de region),
    // sus paneles ya no existen y addTo lanzaba "reading 'appendChild'",
    // tumbando la pantalla entera. El efecto se repite con el mapa nuevo.
    if (!map.getPane('markerPane')) return;
    try {
      marker.addTo(map);
    } catch {
      return;
    }
    markerRef.current = marker;
    if (hasChildren) {
      setHost((marker.getElement()?.querySelector('.escolta-marker-host') as HTMLElement | null) ?? null);
    }
    return () => {
      marker.remove();
      markerRef.current = null;
      setHost(null);
    };
  }, [ctx, valid, hasChildren, title, description, zIndex]);

  useEffect(() => {
    if (!valid) return;
    markerRef.current?.setLatLng([coordinate.latitude, coordinate.longitude]);
  }, [valid, coordinate.latitude, coordinate.longitude]);

  return host && hasChildren ? createPortal(children, host) : null;
}

export function Polyline({ coordinates, strokeColor, strokeWidth, lineDashPattern }: PolylineProps) {
  const ctx = useContext(MapContext);
  const points = (coordinates ?? []).filter(isValid).map((c) => [c.latitude, c.longitude] as [number, number]);
  const pointsKey = JSON.stringify(points);
  const dashKey = lineDashPattern?.join(' ') ?? '';

  useEffect(() => {
    if (!ctx) return;
    const latlngs = JSON.parse(pointsKey) as [number, number][];
    if (latlngs.length < 2 || !ctx.map.getPane('overlayPane')) return;
    const line = ctx.L.polyline(latlngs, {
      color: strokeColor ?? Colors.accent,
      weight: strokeWidth ?? 3,
      opacity: 0.9,
      dashArray: dashKey || undefined,
      lineCap: 'round',
      interactive: false,
    });
    try {
      line.addTo(ctx.map);
    } catch {
      return;
    }
    return () => {
      line.remove();
    };
  }, [ctx, pointsKey, strokeColor, strokeWidth, dashKey]);

  return null;
}

// forwardRef aplica Omit<'ref'> a las props, y un Omit sobre un tipo con
// firma de indice pierde las claves conocidas: se tipa el export a mano.
const MapView = MapViewImpl as unknown as React.ForwardRefExoticComponent<
  MapViewProps & React.RefAttributes<MapViewHandle>
>;

export const PROVIDER_DEFAULT = undefined;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
});

export default MapView;
