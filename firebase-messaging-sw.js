/* firebase-messaging-sw.js
   ملف Service Worker للإشعارات في الخلفية
   يجب أن يكون في نفس مجلد index.html
*/

importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCItxc1N7F7ofxpdpeuaAOqwzdwWA5KJEg",
  authDomain:        "the-challenge-is-over.firebaseapp.com",
  projectId:         "the-challenge-is-over",
  storageBucket:     "the-challenge-is-over.firebasestorage.app",
  messagingSenderId: "825628065422",
  appId:             "1:825628065422:web:83900d2b6dcda8777353df"
});

const messaging = firebase.messaging();

/* استقبال الإشعارات وهو في الخلفية أو مغلق */
messaging.onBackgroundMessage((payload) => {
  const title   = payload.notification?.title || '⏰ انتهى وقت التحدي!';
  const body    = payload.notification?.body  || 'أنت أحد المشاركين — اذهب للتأكيد أو الإلغاء';
  const botLink = payload.data?.botLink       || 'https://t.me/Heksjsjs_bot';

  self.registration.showNotification(title, {
    body,
    icon:    '/icon-192.png',  /* اختياري: ضع صورة أيقونة */
    badge:   '/badge-72.png',  /* اختياري */
    vibrate: [300, 100, 300, 100, 500],
    tag:     'challenge-end',  /* يمنع تكرار الإشعار */
    renotify: true,
    requireInteraction: true,  /* يبقى الإشعار حتى يضغط عليه */
    data: { botLink },
    actions: [
      { action: 'open_bot',  title: '✅ فتح البوت' },
      { action: 'dismiss',   title: 'إغلاق' }
    ]
  });
});

/* عند الضغط على الإشعار */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const botLink = event.notification.data?.botLink || 'https://t.me/Heksjsjs_bot';

  if (event.action === 'dismiss') return;

  /* فتح البوت أو إحضار نافذة التطبيق المفتوحة */
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      /* لو التطبيق مفتوح في الخلفية — أحضره */
      for (const cl of cls) {
        if (cl.url.includes(self.location.origin) && 'focus' in cl) {
          cl.focus();
          return;
        }
      }
      /* وإلا افتح البوت على تيلغرام */
      clients.openWindow(botLink);
    })
  );
});
