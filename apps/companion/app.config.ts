import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Companion',
  slug: 'care-companion',
  scheme: 'carecompanion',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.carecompanion.companion',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription: 'Companion listens so it can talk with you and help you reach your family.',
      UIBackgroundModes: ['audio', 'voip'],
    },
  },
  android: {
    package: 'com.carecompanion.companion',
    permissions: ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'BLUETOOTH', 'FOREGROUND_SERVICE', 'WAKE_LOCK'],
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#FFF9F0',
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#FFF9F0',
      },
    ],
    '@livekit/react-native-expo-plugin',
    '@config-plugins/react-native-webrtc',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID_COMPANION ?? '',
    },
  },
};

export default config;
