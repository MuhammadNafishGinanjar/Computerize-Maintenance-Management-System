# ⚠️ HOSTING & DEPLOYMENT — BACA SEBELUM MENGUBAH KODE

Dokumen ini ditujukan untuk **developer manusia maupun AI agent**.
Sebelum melakukan perubahan apapun, baca bagian ini terlebih dahulu.

---

## Platform Hosting Aktif

| Layer | Platform | URL |
|---|---|---|
| Backend (Flask) | Railway | `https://computerize-maintenance-management-system-production.up.railway.app` |
| Frontend (React) | Railway | *(lihat Railway dashboard)* |
| Database | MongoDB Atlas | Cluster: `cluster0.sijeilt.mongodb.net`, DB: `cmms_db` |

Branch yang di-deploy: **`hosting-1`**
Railway otomatis redeploy setiap kali ada push ke branch `hosting-1`.

---

## File Kritis — JANGAN Diubah Sembarangan

File-file berikut langsung memengaruhi hosting. Perubahan tanpa pertimbangan
matang dapat menyebabkan aplikasi production mati.

### Backend

| File | Fungsi | Risiko jika diubah |
|---|---|---|
| `cmms-backend/Procfile` | Perintah start server di Railway (`gunicorn + eventlet`) | Server tidak bisa start |
| `cmms-backend/requirements.txt` | Dependency Python | Build gagal atau dependency conflict |
| `cmms-backend/app/__init__.py` | Konfigurasi MongoDB URI (`MONGO_URI`) dan CORS | Tidak bisa connect ke Atlas, atau CORS error |
| `cmms-backend/app/predictors/base.py` | Path `_ML_ROOT` ke folder model ML | Semua fitur ML mati (`Ready: False`) |
| `cmms-backend/ml_models/` | File model ML (`.pkl`, `.keras`) | Prediksi ML tidak berfungsi |

### Frontend

| File | Fungsi | Risiko jika diubah |
|---|---|---|
| `cmms-frontend/.env.production` | `VITE_API_BASE_URL` → URL backend Railway | Frontend tidak bisa connect ke backend |
| `cmms-frontend/src/services/api.js` | Axios base URL dari env var | Semua request API gagal |

---

## Environment Variables di Railway

Variabel-variabel ini di-set di Railway dashboard (bukan di file `.env` yang ada di repo).
**Jangan hardcode nilai ini di kode.**

### Backend Service
```
MONGO_URI        = mongodb+srv://...@cluster0.sijeilt.mongodb.net/cmms_db
MONGO_DB_NAME    = cmms_db
SECRET_KEY       = (string acak panjang)
FLASK_DEBUG      = false
CORS_EXTRA_ORIGINS = https://<domain-frontend>.up.railway.app
```

### Cara update jika domain berubah
Jika domain Railway berubah (misal re-deploy dengan nama berbeda):
1. Update `VITE_API_BASE_URL` di `cmms-frontend/.env.production`
2. Update `CORS_EXTRA_ORIGINS` di Railway backend Variables
3. Push ke branch `hosting-1`

---

## Struktur ML Models

Model ML disimpan di dalam `cmms-backend/ml_models/` (bukan di folder `machine-learning filtered data/`).
Folder `machine-learning filtered data/` hanya untuk development lokal dan training.

```
cmms-backend/ml_models/
├── bor/
│   ├── hybrid_model_status.pkl
│   ├── dnn_status.keras
│   └── dnn_extractor_status.keras
├── bubut/        (sama)
├── compressor/   (sama, komponen: bearings)
├── forging/      (sama)
└── induksi/      (sama)
```

Jika menambah model baru: copy file model ke `cmms-backend/ml_models/<folder>/`,
lalu daftarkan di `cmms-backend/app/ml_registry.py`.

---

## Alur Pengembangan Fitur Baru

**JANGAN langsung push ke `hosting-1`.**

```
1. Buat branch baru dari hosting-1
   git checkout hosting-1
   git checkout -b feature/nama-fitur

2. Kerjakan perubahan di branch baru

3. Test lokal

4. Jika sudah siap → merge ke hosting-1
   git checkout hosting-1
   git merge feature/nama-fitur
   git push origin hosting-1

5. Railway otomatis redeploy
```

---

## Simulasi Sensor

Script simulasi ada di `Simulasi/Version 2/simulasi-input data/`.
URL backend sudah di-set ke Railway — jalankan langsung tanpa konfigurasi tambahan.

```bash
cd "Simulasi/Version 2/simulasi-input data"
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python app.py
```

Buka `http://localhost:5000` di browser.
