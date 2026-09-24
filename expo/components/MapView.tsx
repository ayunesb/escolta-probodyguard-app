// Fachada de tipos. En tiempo de ejecucion Metro elige MapView.web.tsx
// (Leaflet) o MapView.native.tsx (react-native-maps); este archivo solo lo
// resuelve TypeScript, que no conoce las extensiones por plataforma. Ambas
// implementaciones comparten la API que usa la app (ver MapView.web.tsx).
export { default, Marker, Polyline, PROVIDER_DEFAULT } from './MapView.web';
export type {
  EdgePadding,
  LatLng,
  MapPressEvent,
  MapViewHandle,
  MapViewProps,
  MarkerProps,
  PolylineProps,
  Region,
} from './MapView.web';
