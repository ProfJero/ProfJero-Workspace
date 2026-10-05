// js/firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.3.0/firebase-app.js';
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.3.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc,
    setDoc,
    getDoc, 
    onSnapshot, 
    orderBy, 
    limit, 
    serverTimestamp,
    Timestamp,
    enableIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/10.3.0/firebase-firestore.js';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.3.0/firebase-storage.js';

// Your Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDSvTre5jtA1CqsbxqLSsJ4n0OBvX4BCqo",
    authDomain: "profjero.firebaseapp.com",
    projectId: "profjero",
    storageBucket: "profjero.firebasestorage.app",
    messagingSenderId: "950791554195",
    appId: "1:950791554195:web:412f915845fbc84634f966",
    measurementId: "G-FG9ZG2FM94"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export initialized services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Export auth functions
export { 
    onAuthStateChanged, 
    signOut,
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
};

// Export firestore functions
export {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    setDoc,
    getDoc,
    onSnapshot,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp,
    updateProfile
};

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.log('Multiple tabs open, persistence enabled in first tab only');
    } else if (err.code === 'unimplemented') {
        console.log('Browser doesn\'t support persistence');
    }
});