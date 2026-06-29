import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  
  // Hardcoding the domains to guarantee the frontend never loses them during deployment
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "civai-faa49.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "civai-faa49",
  
  // THE CRITICAL FIX: Explicitly hardcoding the storage bucket to prevent the "No default bucket" error
  storageBucket: "civai-faa49.firebasestorage.app", 
  
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };