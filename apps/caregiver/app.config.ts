import type { ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Expo push on Android needs a Firebase project. Download google-services.json from the
// Firebase console into apps/caregiver/ (git-ignored). Without it the app still builds;
// push notifications simply will not arrive on Android.
const googleServicesPath = process.env.GOOGLE_SERVICES_JSON ?? resolve(__dirname, 'google-services.json');
const hasGoogleServices = existsSync(googleServicesPath);

const config: ExpoConfig = {
  name: 'Caregiver',
  slug: 'care-caregiver',
  scheme: 'carecaregiver',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.carecompanion.caregiver',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription: 'Caregiver uses the microphone when you take a call from your family member.',
      UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
    },
  },
  android: {
    package: 'com.carecompanion.caregiver',
    permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'BLUETOOTH', 'POST_NOTIFICATIONS', 'VIBRATE'],
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#FFFFFF',
    },
    ...(hasGoogleServices ? { googleServicesFile: googleServicesPath } : {}),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FFFFFF',
      },
    ],
    '@livekit/react-native-expo-plugin',
    '@config-plugins/react-native-webrtc',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#2E7D4F',
        defaultChannel: 'default',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID_CAREGIVER ?? '',
    },
  },
};

export default config;
