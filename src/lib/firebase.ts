import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, 
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,

  authDomain: "civai-faa49.firebaseapp.com",
  projectId: "civai-faa49",
  storageBucket: "civai-faa49.firebasestorage.app", 
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

const storage = getStorage(app, "gs://civai-faa49.firebasestorage.app");

export { app, db, storage };