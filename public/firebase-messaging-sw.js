importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Must match your exact firebase config
firebase.initializeApp({
  apiKey: "AIzaSyA5A-mkl2a2sscQkcuYJkyF-Sqx_i8qF_I",
  projectId: "civai-faa49",
  messagingSenderId: "3810282072",
  appId: "1:3810282072:web:35b2a6769082438abe982d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});