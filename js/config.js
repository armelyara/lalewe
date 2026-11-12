// Central runtime configuration. Switch dataMode to 'firebase' once the
// Firebase project exists and the keys below are filled in.
export const CONFIG = {
  appName: 'Lalewe',
  dataMode: 'mock', // 'mock' (localStorage demo) | 'firebase'
  currency: 'FCFA',
  defaultLang: 'fr', // 'fr' | 'en'
  mapCenter: [5.335, -4.01], // Abidjan
  demoOtp: '0000', // only used in mock mode
  commissionRate: 0.15, // platform fee taken from the driver wallet on accept
  maxStops: 6, // pickup + drop-offs
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },
};
