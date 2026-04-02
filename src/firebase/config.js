import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAKs1HO4gP8DRUMFvLCiVvHhv3764vXjGA",
  authDomain: "mix-touched.firebaseapp.com",
  projectId: "mix-touched",
  storageBucket: "mix-touched.firebasestorage.app",
  messagingSenderId: "301845249823",
  appId: "1:301845249823:web:96efe5929f6d96d06f7a2a",
  measurementId: "G-GTRPMQ7KJL"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

/** 영상·음원 파일용 Firebase Storage */
export const storage = getStorage(app);

export { app };
