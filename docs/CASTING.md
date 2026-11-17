# Aetherhold'u televizyona taşımak

Oyun tarayıcıda çalışıyor, bu yüzden "TV desteği" bir uygulama kurmak değil,
**doğru ekrana doğru adresi açmak** demek. Aşağıdaki yollar en kolaydan en
esneğe doğru sıralı.

Sunucuyu host eden makinenin **LAN adresini** kullan (ör. `http://192.168.1.20:8080`);
`localhost` yalnızca o makinede çalışır. Adres `python server.py` çıktısında
`Network:` satırında yazar.

## 1. HDMI (en sağlam, en düşük gecikme)

Laptopu TV'ye bağla, tarayıcıda LAN adresini aç, `F` ile tam ekran. Kol
bilgisayara bağlıysa gecikme yok denecek kadar azdır. Uzun kablo gerekiyorsa
kablosuz yansıtma yerine bunu tercih et: diğer yollar 40–120 ms gecikme ekler.

## 2. Chromecast / Google TV — "Sekmeyi yayınla"

1. Chrome'da oyunu aç.
2. Sağ üstteki ⋮ → **Yayınla (Cast)** → **Kaynaklar → Sekmeyi yayınla**.
3. Hedef olarak TV'yi seç, sonra `F` ile tam ekran yap.

Sekme yayını görüntüyü TV'ye, sesi bilgisayardan verir; gecikme vardır ama
sıra tabanlı anlatım için fazlasıyla yeterli. Chromecast'in kendi tarayıcısı
yoktur — ondan oyun açılmaz, sadece yayın alır.

## 3. Akıllı TV tarayıcısı (Samsung Tizen, LG webOS, Fire TV Silk)

TV'nin tarayıcısından `http://<LAN-IP>:8080` adresini aç. Klavye/fare olmadığı
için kolu TV'ye bağla (aşağıya bak) ve **TV modunu** aç: `T` tuşu, kolun
Share/Select düğmesi veya `Settings → Graphics → TV mode`. HUD ve yazılar
büyür, hedef alanlar 44 px'e çıkar.

Notlar:
- Bazı TV tarayıcıları pointer-lock'u desteklemez; oyun otomatik olarak
  "sürükle-bak" Moduna düşer, oynanabilir kalır.
- Eski Tizen/webOS sürümlerinde `backdrop-filter` yok; görsel olarak biraz
  daha düz görünür, işlev kaybı olmaz.

## 4. Steam Link / Parsec / Moonlight

PC'yi olduğu gibi yayınlar; oyun TV'de tam kare hızında görünür ve girişler
cihazda çalışır. Ev ağında 5 GHz Wi-Fi ya da kablo önerilir.

## 5. Telefon → TV

Android'de **Yayınla / Smart View**, iPhone'da **AirPlay → Ekran yansıtma**.
Bu yollar videoyu yansıtır; dokunmatik kontroller telefonda kalır, bu yüzden
kolu telefona bağlamak en rahatı.

## Kol bağlama

| Cihaz | Yol |
| --- | --- |
| PC (USB) | Kabloyu tak; Windows/Steam kolu tanır |
| PC (Bluetooth) | DualSense: `PS + Share` tuşlarına 4 sn bas, sonra Windows'a ekle |
| Android TV / Fire TV | Ayarlar → Kumandalar ve Aksesuarlar → Bluetooth → kolu eşleştir |
| Samsung / LG TV | TV'nin Bluetooth menüsünden DualShock/DualSense eşleştir |

Oyun, tarayıcının **Gamepad API**'sini kullanır. Kol bağlanınca ekranda
"DualSense bağlandı" bildirimi çıkar; ayrıldığında klavye-fare sessizce devralır.

### Tuşlar

| Kol | Ne yapar |
| --- | --- |
| Sol çubuk | Yürümek / araçta direksiyon |
| Sağ çubuk | Bakmak |
| R2 | Koşmak / araçta gaz |
| L2 | El freni |
| ✕ / A | Bin, in, konuş (klavyede `E`) |
| △ / Y | Birinci şahıs ↔ omuz üstü (`V`) |
| □ / X | Silah çek / kaldır (`R`) |
| L1 | Harita (`M`) |
| R1 | Envanter (`I`) |
| D-pad ↑ | Bakış modu |
| D-pad ↓ | Karakter sayfası (`C`) |
| Share / Select | TV modu |
| Options / Start | Duraklat / geri (`Esc`) |

## Sorun giderme

- **TV'de "bağlanamadı"** — güvenlik duvarı 8080'i kapatmıştır. Host makinede
  portu aç ya da `--port 9000` gibi başka bir port dene.
- **Kol görünmüyor** — tarayıcıda bir kez sayfaya tıklayıp odaklan; Gamepad API
  yalnızca odaktaki sekmede okunur. Bazı tarayıcılar `chrome://flags` içindeki
  "Gamepad API" bayrağını ister.
- **Yayında ses yok** — sekme yayını sesi taşır; tam ekran yayını taşımaz.
- **Yazılar hâlâ küçük** — TV modu açık mı kontrol et; tarayıcı yakınlaştırması
  `Ctrl +` ile de artırılabilir (HUD ayrı ölçeklendiği için ikisi birlikte çalışır).
