// Mapa nativo (react-native-maps) con estilo oscuro por defecto, a juego con
// el tema. Apple Maps usa userInterfaceStyle; Google Maps (Android) usa
// customMapStyle. Quien lo use puede sobrescribir cualquiera de los dos.
import React, { forwardRef } from 'react';
import RNMapView, { Marker, Polyline, PROVIDER_DEFAULT, type MapViewProps, type MapStyleElement } from 'react-native-maps';
import Colors from '@/constants/colors';

const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: Colors.surface }] },
  { elementType: 'labels.text.fill', stylers: [{ color: Colors.textSecondary }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: Colors.background }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: Colors.border }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: Colors.elevated }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: Colors.border }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: Colors.borderStrong }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: Colors.background }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const MapView = forwardRef<RNMapView, MapViewProps>(function MapView(props, ref) {
  return <RNMapView ref={ref} userInterfaceStyle="dark" customMapStyle={DARK_MAP_STYLE} {...props} />;
});

export default MapView;
export { Marker, Polyline, PROVIDER_DEFAULT };
