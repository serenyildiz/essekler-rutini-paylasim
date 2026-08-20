// Eşşeklerin Rutini — bildirim gönderici (Supabase Edge Function: "notify")
// Yükü olmayan (payload-less) web push gönderir; ne yazacağını alıcının
// service worker'ı Supabase'den okuyup kendisi belirler.

const SB   = Deno.env.get('SUPABASE_URL')!;
const SKEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWK  = JSON.parse(Deno.env.get('VAPID_JWK')!);
const PUB  = Deno.env.get('VAPID_PUBLIC')!;
const SUBJ = Deno.env.get('VAPID_SUBJECT') || 'mailto:seninadresin@example.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let signKey: CryptoKey | null = null;
async function getKey() {
  if (!signKey) {
    signKey = await crypto.subtle.importKey(
      'jwk', JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  return signKey;
}

/* Push servisi için VAPID JWT üret (ES256) */
async function vapidHeader(endpoint: string) {
  const aud = new URL(endpoint).origin;
  const enc = new TextEncoder();
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({
    aud, sub: SUBJ, exp: Math.floor(Date.now() / 1000) + 11 * 3600,
  })));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, await getKey(), enc.encode(data));
  return `vapid t=${data}.${b64u(sig)}, k=${PUB}`;
}

async function db(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}`,
               'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { room, from } = await req.json();
    if (!room) {
      return new Response(JSON.stringify({ error: 'room gerekli' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const rows = await (await db(
      `subs?room=eq.${encodeURIComponent(room)}&select=endpoint,player`)).json();
    /* gönderenin kendi telefonuna bildirim yollama */
    const targets = rows.filter((s: any) => !from || s.player !== from);

    let sent = 0, gone = 0;
    const errors: string[] = [];

    for (const s of targets) {
      try {
        const res = await fetch(s.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidHeader(s.endpoint),
            TTL: '3600',
            Urgency: 'normal',
          },
        });
        if (res.status === 404 || res.status === 410) {
          gone++;
          await db(`subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
        } else if (res.ok) {
          sent++;
        } else {
          errors.push(`${res.status} ${(await res.text()).slice(0, 120)}`);
        }
      } catch (e) {
        errors.push(String(e).slice(0, 120));
      }
    }

    return new Response(JSON.stringify({ ok: true, aboneler: rows.length, sent, gone, errors }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
