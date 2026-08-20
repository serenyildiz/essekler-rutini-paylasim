/* Eşşeklerin Rutini — çevrimdışı önbellek + bildirim */
const V = 'essek-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

const SB   = '';   // Supabase proje adresin
const SKEY = '';   // publishable anahtarın

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    /* SADECE eski uygulama önbelleklerini sil. 'essek-cfg' oda kodunu tutuyor;
       onu silersek bildirimler neyin değiştiğini okuyamaz. */
    .then(ks => Promise.all(ks.filter(k => k.startsWith('essek-v') && k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(V).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => {
      if (r) return r;
      /* Yedeğe düşerken index.html'i SADECE sayfa gezinmelerinde ver.
         Aksi halde version.txt gibi istekler de HTML alır ve uygulama şaşırır. */
      if (req.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    }))
  );
});

/* ---- hangi odayı dinliyoruz? abone olurken kaydedilir ---- */
const VARSAYILAN_ODA = '';
async function getRoom() {
  try {
    const c = await caches.open('essek-cfg');
    const r = await c.match('room');
    if (r) {
      const { room } = await r.json();
      if (room) return room;
    }
  } catch (_) {}
  return VARSAYILAN_ODA;          // önbellek silinmiş olsa da bildirim çalışsın
}

/* son olayı insan diline çevir */
function describe(ev, players, tasks) {
  const who = (players.find(p => p.id === ev.player) || {}).name || 'Biri';
  const isim = id => {
    const t = (tasks || []).find(x => x.id === id);
    return t ? t.name : 'bir iş';
  };
  switch (ev.type) {
    case 'photo':    return `${who} yeni bir fotoğraf paylaştı! 📷`;
    case 'note':     return `Eşşek ${who} sent you a message!`;
    case 'task':     return `${who} "${ev.name}" yaptı · +${ev.points}p`;
    case 'todo':     return `${who} yeni bir iş ekledi: ${ev.name}`;
    case 'assign':   return `${who}, "${isim(ev.taskId)}" işini üstlendi 💪`;
    case 'unassign': return `"${isim(ev.taskId)}" işi bırakıldı — sahipsiz kaldı`;
    case 'buy':      return `${who} ödül aldı: ${ev.name} 🎁`;
    case 'fulfill':  return `${who} bir ödülü teslim etti ✅`;
    case 'watch':    return `${who} listeye ekledi: ${ev.title}`;
    case 'watched':  return `${who} bir şey izlendi olarak işaretledi 🍿`;
    case 'reschedule': return `${who} bir işin tarihini değiştirdi 📅`;
    case 'bonus':    return `${who} bonus puan aldı (+${ev.points}p)`;
    default:         return `${who} bir şeyler değiştirdi`;
  }
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let body = 'Bir şeyler değişti — bak bakalım 👀';
    try {
      const room = await getRoom();
      if (room) {
        const r = await fetch(
          `${SB}/rest/v1/rooms?id=eq.${encodeURIComponent(room)}&select=data`,
          { headers: { apikey: SKEY, Authorization: 'Bearer ' + SKEY } });
        const rows = await r.json();
        const st = rows[0] && rows[0].data;
        if (st && st.log) {
          const undone = new Set(st.log.filter(x => x.type === 'undo').map(x => x.ref));
          const gizli = new Set(['undo', 'reset']);
          const log = st.log
            .filter(x => !gizli.has(x.type) && !undone.has(x.id))
            .sort((a, b) => a.t - b.t);
          const last = log[log.length - 1];
          if (last) body = describe(last, st.config.players || [], st.config.tasks || []);
        }
      }
    } catch (_) {}
    await self.registration.showNotification('Eşşeklerin Rutini 🫏', {
      body, icon: './icon-192.png', badge: './icon-192.png',
      tag: 'essek', renotify: true, data: { url: './index.html' },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(location.origin)) return c.focus();
    }
    return clients.openWindow('./index.html');
  })());
});
