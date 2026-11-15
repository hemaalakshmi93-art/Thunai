import { config } from '../config.js';
import { FileStore } from './fileStore.js';

export async function createStore() {
  if (config.store === 'firestore') {
    const { FirestoreStore } = await import('./firestoreStore.js');
    return new FirestoreStore(process.env.GOOGLE_CLOUD_PROJECT);
  }
  return new FileStore(config.dataDir);
}
