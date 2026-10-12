import AsyncStorage from '@react-native-async-storage/async-storage';

// Static web export runs outside a browser, where AsyncStorage has nothing to write to.
export const authStorage = typeof window === 'undefined' ? undefined : AsyncStorage;
