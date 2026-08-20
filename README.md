# 🫏 Eşşeklerin Rutini

İki kişilik, oyunlaştırılmış ev işi uygulaması. Tek sayfa, çerçevesiz JavaScript,
derleme aracı yok. Telefonda ana ekrana eklenip uygulama gibi çalışır.

## Ne yapar

- **Görevler** — günlük/haftalık/aylık ya da "2 günde bir" gibi özel aralıklı
- **Dönüşümlü işler** — kedi kumu gibi: en son kim yaptıysa sıra diğerinde
- **İş üstlenme** — bir işi üstüne alırsın, bitirene kadar sende kalır; bırakabilirsin
- **Tarihli işler** — son gün ver, kaçırılırsa puan cezası
- **Haftalık ortak hedef** ve üst üste tutturulan hafta serisi
- **Dükkân** — biriken puanla ödül al ("bulaşık muafiyeti", "film seçme hakkı")
- **Rütbeler** — Yavru Eşşek'ten Ev Tanrısı'na
- **Günlük fotoğraf** — her gün ikiniz birer fotoğraf, gece yarısı yenilenir, arşivlenir
- **Not defteri** ve **film/dizi izleme listesi** (ekran görüntüsüyle)
- **Bildirimler** — karşı taraf bir şey yapınca telefonuna düşer

## Nasıl çalışır

Veri, **ekleme-yalnızca olay kaydı** (append-only event log) olarak tutulur.
Puanlar, sahiplikler, seriler hep bu kayıttan hesaplanır. İki telefon aynı anda
işlem yapsa bile kayıtlar birleştirilir, hiçbir şey kaybolmaz — çevrimdışı
yapılanlar bağlanınca eklenir.

Senkron için Supabase'de tek bir `rooms` tablosu yeter; "oda kodu" aynı olan
herkes aynı veriyi görür.

## Kurulum

### 1. Siteyi yayınla
Statik dosyalar; herhangi bir yerde çalışır.

```bash
./build.sh v1        # dist/ üretir
```

`dist/` klasörünü Netlify / Cloudflare Pages / GitHub Pages'e koy.
(Netlify kullanıyorsan `netlify.toml` hazır, git'e bağlaman yeterli.)

### 2. Senkronu bağla (ücretsiz)
[supabase.com](https://supabase.com) → yeni proje → **SQL Editor**:

```sql
create table rooms (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now()
);
alter table rooms enable row level security;
create policy "acik" on rooms for all using (true) with check (true);
```

**Project Settings → API**'den URL ve publishable anahtarı al, uygulamada
sağ üstteki noktaya dokunup gir. Oda kodunu ikinizde aynı yaz.

> Oda kodu bir paroladır. Bilen herkes veriyi okuyup değiştirebilir —
> tahmin edilmesi zor bir şey seç, kimseyle paylaşma.

### 3. Bildirimler (isteğe bağlı)

VAPID anahtar çifti üret:

```bash
python3 - <<'PY'
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64, json
b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip('=')
k = ec.generate_private_key(ec.SECP256R1())
pub = k.public_key().public_bytes(serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint)
d = k.private_numbers().private_value.to_bytes(32, 'big')
print('VAPID_PUBLIC:', b64u(pub))
print('VAPID_JWK   :', json.dumps({"kty":"EC","crv":"P-256","d":b64u(d),
      "x":b64u(pub[1:33]), "y":b64u(pub[33:65]), "key_ops":["sign"], "ext":True}))
PY
```

Sonra:
- `subs` tablosunu oluştur:
  ```sql
  create table subs (
    endpoint text primary key, room text not null, player text,
    keys jsonb, created_at timestamptz default now()
  );
  alter table subs enable row level security;
  create policy "subs_acik" on subs for all using (true) with check (true);
  ```
- `supabase-notify.ts` dosyasını `notify` adıyla Edge Function olarak kur
- Fonksiyon gizli değişkenleri: `VAPID_JWK`, `VAPID_PUBLIC`, `VAPID_SUBJECT`
- `index.html` içindeki `VAPID_PUBLIC` sabitini doldur
- `sw.js` içindeki `SB` ve `SKEY` sabitlerini doldur

**iOS notu:** Safari bildirimlere yalnızca ana ekrana eklenmiş sitelerde
izin veriyor (iOS 16.4+). Siteyi Paylaş → "Ana Ekrana Ekle" ile kurup
ikondan açmak gerekiyor.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `index.html` | Uygulamanın tamamı — arayüz, mantık, stiller |
| `sw.js` | Çevrimdışı önbellek + bildirim karşılama |
| `supabase-notify.ts` | Bildirim gönderen Edge Function |
| `build.sh` | `dist/` üretir, sürüm numarasını damgalar |
| `netlify.toml` | Netlify derleme ayarı |

## Sürümleme

`build.sh` sürümü kayıt sayısından türetir ve `version.txt` yazar. Uygulama
açılışta bunu kontrol edip yeni sürüm varsa "Güncelle" çubuğu gösterir —
telefonda eski sürümde takılı kalmayı önler.

## Lisans

MIT — istediğin gibi kullan.
