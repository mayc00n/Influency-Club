import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithRedirect } from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  collection, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  setDoc, 
  getDoc, 
  getDocs, 
  Timestamp,
  serverTimestamp,
  getDocFromServer,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings to improve connectivity in restricted environments
const databaseId = "ai-studio-dab4eee5-aa37-4dea-a5b7-8027984a44d9";
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
}, databaseId);

/**
 * Tests the Firestore connection by attempting to fetch a document from the server.
 * If it fails with "offline" error, it can be used to diagnose environment issues.
 */
export async function testFirestoreConnection() {
  try {
    // Try to reach the server directly
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    return true;
  } catch (error: any) {
    console.error('Firestore Connection Test Failed:', error);
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      // Small trick: toggle network to force a reconnect attempt
      try {
        await disableNetwork(db);
        await enableNetwork(db);
      } catch (e) {
        console.error('Failed to toggle network:', e);
      }
    }
    return false;
  }
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { ref, uploadBytes, getDownloadURL, serverTimestamp, getDocFromServer, getDoc, enableNetwork, signInWithRedirect };
export const googleProvider = new GoogleAuthProvider();

export const driveProvider = new GoogleAuthProvider();
driveProvider.addScope('https://www.googleapis.com/auth/drive.file');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We remove the throw to allow components to handle errors gracefully via UI state
}
