/* firebase-messaging-sw.js
 * ══════════════════════════════════════════════════════════
 * Service Worker — إشعارات FCM عالية الأولوية
 *
 * هذا الملف هو المسؤول الوحيد عن إيصال الرنين حتى عندما:
 * ① التطبيق مغلق تماماً (killed)
 * ② موفر الطاقة مفعّل (Doze Mode / Battery Saver)
 * ③ الشاشة مقفلة
 *
 * السبب: FCM High-Priority يستخدم قناة خاصة في Google
 * تتجاوز قيود Android الطاقة — بموافقة المستخدم.
 * ══════════════════════════════════════════════════════════
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

/* ══ استقبال رسائل الخلفية ══
 *
 * يُستدعى هذا الكود حتى لو:
 * - التطبيق مغلق تماماً
 * - الشاشة مقفلة
 * - موفر الطاقة مفعّل
 *
 * شرط واحد: المستخدم منح إذن الإشعارات مسبقاً
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] رسالة خلفية وصلت:', payload);

  const title   = payload.notification?.title  || '⏰ انتهى وقت التحدي!';
  const body    = payload.notification?.body   || 'أنت أحد المشاركين — اذهب للتأكيد أو الإلغاء';
  const botLink = payload.data?.botLink        || 'https://t.me/Heksjsjs_bot';

  /* إنشاء قناة إشعار بأولوية عالية جداً */
  const options = {
    body,
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',

    /* tag: يمنع تكديس الإشعارات — آخر تحدٍّ فقط يظهر */
    tag:      'challenge-end',
    renotify: true,

    /* requireInteraction: يبقى الإشعار حتى يضغط عليه المستخدم */
    requireInteraction: true,

    /* vibrate: نمط اهتزاز قوي — يعمل حتى مع الصامت */
    vibrate: [500, 200, 500, 200, 500, 200, 1000],

    /* silent: false → يُشغّل صوت الإشعار الافتراضي للجهاز */
    silent: false,

    data: { botLink, type: 'challenge_completed' },

    /* actions: أزرار في الإشعار مباشرة */
    actions: [
      { action: 'open_bot', title: '✅ فتح البوت' },
      { action: 'dismiss',  title: '❌ إغلاق'      },
    ],
  };

  /* عرض الإشعار */
  return self.registration.showNotification(title, options);
});

/* ══ عند الضغط على الإشعار ══ */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const botLink = event.notification.data?.botLink || 'https://t.me/Heksjsjs_bot';

  /* زر الإغلاق فقط — لا تفتح شيئاً */
  if(event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      /* إن كان التطبيق مفتوحاً في الخلفية — أحضره للأمام */
      for(const cl of cls){
        if(cl.url && cl.url.includes(self.location.origin) && 'focus' in cl){
          return cl.focus();
        }
      }
      /* وإلا افتح البوت على تيلغرام */
      return clients.openWindow(botLink);
    })
  );
});

/* ══ عند عرض الإشعار ══ */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] أُغلق الإشعار بدون ضغط');
});

/* ══ تثبيت Service Worker فوراً ══
 * skipWaiting + claim تجعل التحديثات فورية بدون انتظار
 */
self.addEventListener('install', (event) => {
  console.log('[SW] تثبيت Service Worker');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] تفعيل Service Worker');
  event.waitUntil(clients.claim());
});
