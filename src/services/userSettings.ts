import AsyncStorage from '@react-native-async-storage/async-storage';

const MY_EMAIL_KEY = '@lavati_my_email';

export async function getMyEmail(): Promise<string | null> {
  return AsyncStorage.getItem(MY_EMAIL_KEY);
}

export async function setMyEmail(email: string | null): Promise<void> {
  if (email) {
    await AsyncStorage.setItem(MY_EMAIL_KEY, email);
  } else {
    await AsyncStorage.removeItem(MY_EMAIL_KEY);
  }
}
