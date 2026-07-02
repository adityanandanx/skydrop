import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore, setLogLevel } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBBK19b1dkSEQYzCpKpb2BFBjG3buEpcfg",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "skydrop-9f088.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "skydrop-9f088",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "skydrop-9f088.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "129656912480",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:129656912480:web:30877905242c895d21e105",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-SST9W3M9B9",
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

// Prevent build-time initialization errors when environment variables are not yet present
if (typeof window !== "undefined" ? !!firebaseConfig.apiKey : (process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== "undefined")) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    
    // Enable verbose logging in development to diagnose connection issues
    if (process.env.NODE_ENV === "development") {
      setLogLevel("debug");
    }
  } catch (error) {
    console.warn("Firebase failed to initialize:", error);
  }
}

export { app, auth, db };
