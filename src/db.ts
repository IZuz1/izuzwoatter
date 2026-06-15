import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, Firestore } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfig from '../firebase-applet-config.json';

export interface TelegramSubscription {
  chatId: string;
  districtCode: string;
  districtName: string;
  username?: string;
  createdAt: string;
}

// Check if Firebase has been configured with real keys
const isFirebasePlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("placeholder") || firebaseConfig.projectId.includes("placeholder");

let dbInstance: Firestore | null = null;
if (!isFirebasePlaceholder) {
  try {
    const app = initializeApp(firebaseConfig);
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    console.log("🔥 Firebase Firestore successfully initialized for subscriptions persistence.");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Firestore:", error);
  }
} else {
  console.log("📦 Running in local JSON storage mode. (Firebase unconfigured/placeholder)");
}

// Local JSON File Fallback for Cloud Run /tmp (isolated and persistent during active sessions)
const LOCAL_DB_PATH = path.join('/tmp', 'water_subscriptions.json');

function ensureLocalDbExists() {
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify([], null, 2));
    }
  } catch (_) {
    // If not on server, ignore
  }
}

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
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Returns all active subscriptions
 */
export async function getSubscriptions(): Promise<TelegramSubscription[]> {
  if (dbInstance) {
    try {
      const querySnapshot = await getDocs(collection(dbInstance, 'subscriptions'));
      const list: TelegramSubscription[] = [];
      querySnapshot.forEach((doc) => {
        list.push(doc.data() as TelegramSubscription);
      });
      return list;
    } catch (e: any) {
      if (e?.message && (e.message.includes('permission') || e.message.includes('Permission'))) {
        handleFirestoreError(e, OperationType.GET, 'subscriptions');
      }
      console.error("Firestore read error:", e);
      // Fallback below
    }
  }

  // Local JSON implementation
  ensureLocalDbExists();
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to read local DB:", e);
  }
  return [];
}

/**
 * Creates/Updates a subscription
 */
export async function saveSubscription(sub: TelegramSubscription): Promise<void> {
  if (dbInstance) {
    try {
      await setDoc(doc(dbInstance, 'subscriptions', sub.chatId), sub);
      console.log(`Subscribed chat:${sub.chatId} to ${sub.districtName} (Firestore)`);
      return;
    } catch (e: any) {
      if (e?.message && (e.message.includes('permission') || e.message.includes('Permission'))) {
        handleFirestoreError(e, OperationType.WRITE, `subscriptions/${sub.chatId}`);
      }
      console.error("Firestore write error:", e);
      // Fallback below
    }
  }

  // Local JSON implementation
  ensureLocalDbExists();
  try {
    const subs = await getSubscriptions();
    const existingIdx = subs.findIndex(s => s.chatId === sub.chatId);
    if (existingIdx !== -1) {
      subs[existingIdx] = sub;
    } else {
      subs.push(sub);
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(subs, null, 2));
    console.log(`Subscribed chat:${sub.chatId} to ${sub.districtName} (Local JSON)`);
  } catch (e) {
    console.error("Failed to write local DB:", e);
  }
}

/**
 * Removes a subscription
 */
export async function removeSubscription(chatId: string): Promise<boolean> {
  if (dbInstance) {
    try {
      await deleteDoc(doc(dbInstance, 'subscriptions', chatId));
      console.log(`Unsubscribed chat:${chatId} (Firestore)`);
      return true;
    } catch (e: any) {
      if (e?.message && (e.message.includes('permission') || e.message.includes('Permission'))) {
        handleFirestoreError(e, OperationType.DELETE, `subscriptions/${chatId}`);
      }
      console.error("Firestore delete error:", e);
      // Fallback below
    }
  }

  // Local JSON implementation
  ensureLocalDbExists();
  try {
    const subs = await getSubscriptions();
    const lengthBefore = subs.length;
    const filtered = subs.filter(s => s.chatId !== chatId);
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(filtered, null, 2));
    console.log(`Unsubscribed chat:${chatId} (Local JSON)`);
    return filtered.length < lengthBefore;
  } catch (e) {
    console.error("Failed to unsubscribe local DB:", e);
    return false;
  }
}
