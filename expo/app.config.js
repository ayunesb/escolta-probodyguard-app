import 'dotenv/config';
import fs from 'fs';

// Los archivos de credenciales de Firebase para movil no estan en el repo
// (es publico). Se declaran solo si existen, para que la compilacion web y
// el arranque en desarrollo sigan funcionando sin ellos.
const archivoAndroid = './google-services.json';
const archivoIOS = './GoogleService-Info.plist';
const hayAndroid = fs.existsSync(archivoAndroid);
const hayIOS = fs.existsSync(archivoIOS);

export default {
  expo: {
    name: 'Escolta Pro',
    slug: 'escolta-pro',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'escoltapro',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#05080F'
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.escolta.pro",
      ...(hayIOS ? { googleServicesFile: archivoIOS } : {}),
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSExceptionDomains: {
            'localhost': {
              NSExceptionAllowsInsecureHTTPLoads: true
            },
            'exp.direct': {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: true
            },
            '127.0.0.1': {
              NSExceptionAllowsInsecureHTTPLoads: true
            }
          }
        }
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#05080F'
      },
      package: 'com.escolta.pro',
      ...(hayAndroid ? { googleServicesFile: archivoAndroid } : {}),
      permissions: [
        'NOTIFICATIONS',
        'POST_NOTIFICATIONS',
        'CAMERA',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION'
      ]
    },
    web: {
      name: 'Escolta Pro',
      shortName: 'Escolta Pro',
      description: 'Vetted close-protection professionals, booked in minutes and tracked in real time.',
      themeColor: '#05080F',
      backgroundColor: '#05080F',
      favicon: './assets/favicon.png',
      bundler: 'metro',
      config: {
        // Content Security Policy for web
        meta: {
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://js.braintreegateway.com https://checkout.paypal.com https://www.paypal.com",
            "style-src 'self' 'unsafe-inline' https://checkout.paypal.com https://fonts.googleapis.com",
            "img-src 'self' data: https: https://checkout.paypal.com https://assets.braintreegateway.com",
            "connect-src 'self' https://api.stripe.com https://*.vercel.app https://api.braintreegateway.com https://api.sandbox.braintreegateway.com https://firestore.googleapis.com https://firebase.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.tile.openstreetmap.org",
            "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
            "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.paypal.com https://assets.braintreegateway.com",
            "object-src 'none'",
            "base-uri 'self'"
          ].join('; ')
        }
      }
    },
    owner: 'ayunesb',
    updates: {
      url: 'https://u.expo.dev/7cee6c31-9a1c-436d-9baf-57fc8a43b651'
    },
    runtimeVersion: '1.0.0',
    extra: {
      // === BRAINTREE CONFIGURATION (CLIENT-SAFE) ===
      // Only expose environment and tokenization key - never private credentials!
      braintreeEnv: process.env.EXPO_PUBLIC_BRAINTREE_ENV || 'sandbox',
      braintreeTokenizationKey: process.env.EXPO_PUBLIC_BRAINTREE_TOKENIZATION_KEY,

      // === FIREBASE CONFIGURATION ===
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,

      // === EAS PROJECT LINK ===
      eas: {
        projectId: '7cee6c31-9a1c-436d-9baf-57fc8a43b651'
      }
    },
    notification: {
      // Debe ser una silueta blanca sobre transparente: Android fuerza el
      // icono de notificaciones a blanco solido en la barra de estado sin
      // importar el color real del archivo, asi que un icono a color se ve
      // como un bloque blanco sin forma. Ver assets/notification-icon.png.
      icon: './assets/notification-icon.png',
      color: '#C9A227',
      androidMode: 'default'
    },
    plugins: [
      'expo-web-browser',
      ['expo-notifications', {
        icon: './assets/icon.png',
        color: '#C9A227'
      }],
      // microphonePermission: false a proposito — no hay ninguna funcion de
      // audio/voz en la app, expo-image-picker agrega RECORD_AUDIO por
      // default si no se bloquea explicitamente.
      ['expo-image-picker', {
        photosPermission: 'Escolta Pro uses your photo library so you can upload ID, license and profile documents for account verification.',
        cameraPermission: 'Escolta Pro uses your camera so guards can capture ID, license and outfit photos for account verification.',
        microphonePermission: false
      }],
      ['expo-location', {
        locationWhenInUsePermission: "Escolta Pro uses your location to find nearby guards, set pickup addresses, and show a guard's live position during an active service.",
        locationAlwaysAndWhenInUsePermission: "Escolta Pro shares a guard's location with their client during an active protection service, including while the app is in the background, so the client can track their guard's arrival and route.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true
      }]
    ]
  }
};
