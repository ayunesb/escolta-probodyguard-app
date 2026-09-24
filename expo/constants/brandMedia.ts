// Fotografia y video de marca (generados para Escolta Pro, estilo "Midnight &
// Ice"). Originales en assets/brand/raw — no se empaquetan; estos son los
// comprimidos que usa la app.
import type { ImageSourcePropType } from 'react-native';

export const BrandImages = {
  heroDoor: require('@/assets/brand/img/hero-door.jpg') as ImageSourcePropType,
  opsRoom: require('@/assets/brand/img/ops-room.jpg') as ImageSourcePropType,
  cityAerial: require('@/assets/brand/img/city-aerial.jpg') as ImageSourcePropType,
  shield: require('@/assets/brand/img/shield-glass.png') as ImageSourcePropType,
  services: {
    airport: require('@/assets/brand/img/service-airport.jpg') as ImageSourcePropType,
    executive: require('@/assets/brand/img/service-executive.jpg') as ImageSourcePropType,
    events: require('@/assets/brand/img/service-events.jpg') as ImageSourcePropType,
    family: require('@/assets/brand/img/service-family.jpg') as ImageSourcePropType,
  },
  vehicles: {
    standard: require('@/assets/brand/img/vehicle-standard.jpg') as ImageSourcePropType,
    armored: require('@/assets/brand/img/vehicle-armored.jpg') as ImageSourcePropType,
  },
} as const;

// Video de fondo de la pantalla de acceso: bucle sin corte de 7 s, 720p, sin audio.
export const BrandVideo = {
  loginLoop: require('@/assets/brand/video/login-loop.mp4') as number,
  loginPoster: require('@/assets/brand/video/login-poster.jpg') as ImageSourcePropType,
} as const;

// Servicios que se muestran en el inicio del cliente.
export const SERVICE_MOMENTS = [
  { key: 'airport', title: 'Airport & aviation', caption: 'Terminal to door, on the tarmac', image: BrandImages.services.airport },
  { key: 'executive', title: 'Executive travel', caption: 'Meetings, roadshows, the city', image: BrandImages.services.executive },
  { key: 'events', title: 'Events & galas', caption: 'Discreet presence, all night', image: BrandImages.services.events },
  { key: 'family', title: 'Family & residence', caption: 'Villas, travel, peace of mind', image: BrandImages.services.family },
] as const;
