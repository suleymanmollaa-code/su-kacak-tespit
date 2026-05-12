# SuSayar Backend

ESP32 + YF-S201 akış sensörü için Node.js backend.

## Başlatmak

```bash
cd backend
npm install
node server.js          # normal
node --watch server.js  # otomatik yeniden başlat (geliştirme)
```

## Konfigürasyon (isteğe bağlı)

```bash
cp .env.example .env
# .env dosyasını düzenle
```

## Endpoint'ler

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/sensor` | ESP32 veri gönderir |
| GET | `/api/latest` | En son okuma |
| GET | `/api/history?n=100` | Son N okuma |
| GET | `/api/anomalies` | Tespit edilen kaçaklar |
| POST | `/api/anomalies/:id/resolve` | Anomaliyi çöz |
| GET | `/api/stats` | Landing page istatistikleri |
| GET | `/api/devices` | Bağlı cihazlar |
| GET | `/api/health` | Sistem durumu |
| WS | `/ws` | Dashboard gerçek zamanlı bağlantısı |

## Dashboard Bağlantısı

1. `node server.js` çalıştırın
2. `http://localhost:3001/susayar-dashboard.html` açın
3. Sağ üstteki **"🔌 Cihaz Bağla"** butonuna tıklayın
4. URL: `ws://localhost:3001/ws` → **Bağlan**

## ESP32 Kurulumu

Arduino kodunda:
```cpp
const char* SERVER_URL = "http://192.168.1.X:3001/api/sensor";
```
`192.168.1.X` → bu bilgisayarın yerel IP adresi (`ifconfig` veya `ipconfig`)

## Test (ESP32 olmadan)

```bash
curl -X POST http://localhost:3001/api/sensor \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "susayar-001",
    "flow_lpm": 3.47,
    "total_liters": 142.6,
    "pulses": 386,
    "uptime_sec": 8724,
    "rssi_dbm": -58
  }'
```

## Anomali Tespiti

Backend otomatik olarak şu durumları tespit eder:

- **Gece akışı** — 00:00–05:00 arası herhangi bir akış
- **Damlama** — 10+ dakika süren 0.5 L/dk altı akış
- **Uzun akış** — 30+ dakika kesintisiz akış
- **Yüksek tüketim** — günlük ort. 2x üstü anlık debi
