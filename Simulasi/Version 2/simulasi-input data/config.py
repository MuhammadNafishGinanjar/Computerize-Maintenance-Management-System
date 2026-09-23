"""
Konfigurasi form simulasi input data sensor.

Profil bawaan: "bubut" (BBT-001) — mesin yang dipakai untuk demo/sidang.
Menjalankan `python app.py` tanpa embel-embel apa pun SELALU menunjuk BBT-001,
tidak akan pernah nyasar ke compressor atau mesin lain.

Mesin lain hanya terpilih kalau diminta secara SENGAJA, lewat argumen:

    python app.py bor

atau lewat env var MACHINE_PROFILE:

    # Windows PowerShell
    $env:MACHINE_PROFILE = "bor"; python app.py

    # Git Bash / Linux
    MACHINE_PROFILE=bor python app.py

Menambah mesin baru: tambahkan satu entri di PROFILES. Daftar SENSOR_FIELDS-nya
bisa dicetak otomatis dari model dengan:

    cd cmms-backend
    venv/Scripts/python.exe -m scripts.cek_mesin <MACHINE_ID>
"""

import os

# URL backend CMMS (Flask) yang sudah di-hosting. Override lewat env var
# CMMS_API_BASE bila perlu (misal untuk tes ke localhost:5000/api).
CMMS_API_BASE = os.environ.get("CMMS_API_BASE", "https://computerize-maintenance-management-system-production.up.railway.app/api").strip()


PROFILES = {
    # ── Kompresor — 5 sensor komponen Bearing ───────────────────────────────
    "compressor": {
        "machine_id": "CMP-DUMMY-001",
        "asset": {
            "name": "Dummy Compressor ML Test Rig",
            "machine_id": "CMP-DUMMY-001",
            "location": "Area Produksi - Simulasi ML",
            "status": "running",
        },
        # key, label, unit, nilai default
        "sensor_fields": [
            ("noise_db",    "Kebisingan",          "dB",    51.50),
            ("water_flow",  "Aliran Air",          "L/min", 58.11),
            ("air_flow",    "Aliran Udara",        "m3/h",  600.0),
            ("gaccx",       "G-Axis Akselerasi X", "g",     0.5768),
            ("outlet_temp", "Suhu Outlet",         "C",     118.28),
        ],
        "presets": [
            {
                "id": "manual",
                "label": "Input Manual",
                "description": "Isi nilai sensor secara manual",
                "data": None,
            },
            {
                "id": "normal",
                "label": "Normal — Bearing OK",
                "description": "Bearing sehat — fault probability ~0% (very low risk)",
                "data": {
                    "noise_db": 51.50, "water_flow": 58.11, "air_flow": 600.0,
                    "gaccx": 0.5768, "outlet_temp": 118.28,
                },
            },
            {
                "id": "bearing_low",
                "label": "Bearing — Risiko Ringan",
                "description": "Bearing mulai tidak normal — fault probability ~11% (low risk)",
                "data": {
                    "noise_db": 57.50, "water_flow": 58.11, "air_flow": 600.0,
                    "gaccx": 0.5768, "outlet_temp": 118.28,
                },
            },
            {
                "id": "bearing_medium",
                "label": "Bearing — Risiko Sedang",
                "description": "Bearing terindikasi fault — fault probability ~37% (medium risk)",
                "data": {
                    "noise_db": 58.00, "water_flow": 58.11, "air_flow": 600.0,
                    "gaccx": 0.5768, "outlet_temp": 118.28,
                },
            },
            {
                "id": "bearing_high",
                "label": "Bearing — Risiko Tinggi",
                "description": "Bearing fault signifikan — fault probability ~70% (high risk)",
                "data": {
                    "noise_db": 57.00, "water_flow": 58.11, "air_flow": 650.0,
                    "gaccx": 0.5768, "outlet_temp": 118.28,
                },
            },
            {
                "id": "bearing_critical",
                "label": "Bearing — Kritis",
                "description": "Bearing kritis — fault probability ~99% (critical risk)",
                "data": {
                    "noise_db": 58.00, "water_flow": 58.11, "air_flow": 700.0,
                    "gaccx": 0.5768, "outlet_temp": 118.28,
                },
            },
        ],
    },

    # ── Mesin Bor — 6 sensor kelistrikan & getaran ──────────────────────────
    # Nilai preset diambil dari baris nyata dataset training
    # (dataset-mesin-bor-training-6000.csv), lalu diverifikasi fault
    # probability-nya lewat model hybrid_model_status.pkl.
    "bor": {
        "machine_id": "DRL-001",
        "asset": {
            "name": "Mesin Bor D1",
            "machine_id": "DRL-001",
            "location": "Area Produksi - Simulasi ML",
            "status": "running",
        },
        "sensor_fields": [
            ("current_a",      "Arus",               "A",    0.834),
            ("active_power_w", "Daya Aktif",         "W",    164.20),
            ("temp_c",         "Suhu",               "C",    34.43),
            ("vx",             "Getaran Sumbu X",    "mm/s", 16.25),
            ("vy",             "Getaran Sumbu Y",    "mm/s", 6.975),
            ("vz",             "Getaran Sumbu Z",    "mm/s", 40.77),
        ],
        "presets": [
            {
                "id": "manual",
                "label": "Input Manual",
                "description": "Isi nilai sensor secara manual",
                "data": None,
            },
            {
                "id": "normal",
                "label": "Normal — Mesin Bor OK",
                "description": "Kondisi sehat — fault probability ~3% (very low risk)",
                "data": {
                    "current_a": 0.834, "active_power_w": 164.20, "temp_c": 34.43,
                    "vx": 16.25, "vy": 6.975, "vz": 40.77,
                },
            },
            {
                "id": "bor_low",
                "label": "Mesin Bor — Risiko Ringan",
                "description": "Suhu mulai naik — fault probability ~20% (low risk)",
                "data": {
                    "current_a": 0.853, "active_power_w": 169.50, "temp_c": 45.44,
                    "vx": 16.21, "vy": 8.134, "vz": 36.37,
                },
            },
            {
                "id": "bor_medium",
                "label": "Mesin Bor — Risiko Sedang",
                "description": "Pola sensor menyimpang — fault probability ~40% (medium risk)",
                "data": {
                    "current_a": 0.830, "active_power_w": 162.20, "temp_c": 42.61,
                    "vx": 16.14, "vy": 2.511, "vz": 36.68,
                },
            },
            {
                "id": "bor_high",
                "label": "Mesin Bor — Risiko Tinggi",
                "description": "Suhu & getaran X naik — fault probability ~65% (high risk)",
                "data": {
                    "current_a": 0.842, "active_power_w": 166.40, "temp_c": 44.80,
                    "vx": 16.83, "vy": 4.618, "vz": 39.82,
                },
            },
            {
                "id": "bor_critical",
                "label": "Mesin Bor — Kritis",
                "description": "Suhu tinggi + getaran abnormal — fault probability ~90% (critical risk)",
                "data": {
                    "current_a": 0.818, "active_power_w": 158.80, "temp_c": 46.11,
                    "vx": 16.90, "vy": 7.628, "vz": 40.12,
                },
            },
        ],
    },

    # ── Mesin Bubut — 6 sensor: daya, suhu, getaran 3 sumbu + resultan ──────
    # Preset dihasilkan oleh sel terakhir bubut_model.ipynb. Kelas normal dan
    # rusak pada dataset bubut terpisah bersih (tidak ada baris nyata dengan
    # fault probability antara 1% dan 99%), jadi preset "normal" dan "kritis"
    # memakai baris pengukuran asli, sementara tiga tingkat di antaranya
    # diinterpolasi normal -> rusak dengan vrms dihitung ulang sebagai resultan
    # vx/vy/vz. Nilai interpolasi ini untuk mendemonstrasikan tingkat risiko di
    # dashboard, bukan pembacaan mesin yang pernah terukur.
    "bubut": {
        "machine_id": "BBT-001",
        "asset": {
            "name": "Mesin Bubut B1",
            "machine_id": "BBT-001",
            "location": "Line Permesinan F",
            "status": "running",
        },
        "sensor_fields": [
            ("active_power_w", "Daya Aktif Total",  "W",    2274.09),
            ("temp_c",         "Suhu",              "C",    30.60),
            ("vx",             "Getaran Sumbu X",   "mm/s", 2.398),
            ("vy",             "Getaran Sumbu Y",   "mm/s", 0.775),
            ("vz",             "Getaran Sumbu Z",   "mm/s", 0.482),
            ("vrms",           "Getaran Resultan",  "mm/s", 2.566),
        ],
        "presets": [
            {
                "id": "manual",
                "label": "Input Manual",
                "description": "Isi nilai sensor secara manual",
                "data": None,
            },
            {
                "id": "normal",
                "label": "Normal — Mesin Bubut OK",
                "description": "Getaran rendah & suhu wajar — fault probability ~0% (very low risk)",
                "data": {
                    "active_power_w": 2274.09, "temp_c": 30.60,
                    "vx": 2.398, "vy": 0.775, "vz": 0.482, "vrms": 2.566,
                },
            },
            {
                "id": "bubut_low",
                "label": "Mesin Bubut — Risiko Ringan",
                "description": "Getaran mulai naik — fault probability ~20% (low risk)",
                "data": {
                    "active_power_w": 2326.204, "temp_c": 28.929,
                    "vx": 5.093, "vy": 1.740, "vz": 1.746, "vrms": 5.659,
                },
            },
            {
                "id": "bubut_medium",
                "label": "Mesin Bubut — Risiko Sedang",
                "description": "Getaran mendekati ambang — fault probability ~40% (medium risk)",
                "data": {
                    "active_power_w": 2328.933, "temp_c": 28.841,
                    "vx": 5.235, "vy": 1.791, "vz": 1.812, "vrms": 5.822,
                },
            },
            {
                "id": "bubut_high",
                "label": "Mesin Bubut — Risiko Tinggi",
                "description": "Getaran melewati ambang — fault probability ~65% (high risk)",
                "data": {
                    "active_power_w": 2331.934, "temp_c": 28.745,
                    "vx": 5.390, "vy": 1.846, "vz": 1.885, "vrms": 6.001,
                },
            },
            {
                "id": "bubut_critical",
                "label": "Mesin Bubut — Kritis",
                "description": "Getaran spindle tinggi & suhu turun drastis — fault probability ~100% (critical risk)",
                "data": {
                    "active_power_w": 2383.23, "temp_c": 27.10,
                    "vx": 8.043, "vy": 2.796, "vz": 3.129, "vrms": 9.072,
                },
            },
        ],
    },
}


# Profil bawaan sengaja "bubut", bukan "compressor". Sebelumnya lupa menyetel
# MACHINE_PROFILE membuat simulasi diam-diam menunjuk compressor — tampak jalan
# normal, padahal data dan slider mengarah ke mesin yang salah. Dengan bawaan
# ini, tidak menyetel apa pun berarti BBT-001.
DEFAULT_PROFILE = "bubut"

_PROFILE_NAME = os.environ.get("MACHINE_PROFILE", "").strip() or DEFAULT_PROFILE
if _PROFILE_NAME not in PROFILES:
    raise SystemExit(
        f"MACHINE_PROFILE='{_PROFILE_NAME}' tidak dikenal. "
        f"Pilihan: {', '.join(PROFILES)}"
    )

_PROFILE = PROFILES[_PROFILE_NAME]

# Nama-nama di bawah ini yang dibaca app.py — bentuknya tetap sama seperti
# sebelumnya, jadi app.py dan template tidak perlu diubah.
PROFILE_NAME = _PROFILE_NAME
MACHINE_ID = _PROFILE["machine_id"]
DUMMY_ASSET = _PROFILE["asset"]
SENSOR_FIELDS = _PROFILE["sensor_fields"]
PRESETS = _PROFILE["presets"]
