"""
Konfigurasi simulasi Version 2 — 5 sensor untuk komponen Bearing.
"""

# URL backend yang di-hosting
BASE_URL = "https://computerize-maintenance-management-system-production.up.railway.app/api/ml"

# Machine ID target (sesuai field machine_id di database aset)
MACHINE_ID = "CMP-DUMMY-001"

# Interval pengiriman data (detik)
INTERVAL_SECONDS = 3

# Jumlah data yang dikirim per sesi (None = kirim terus tanpa batas)
TOTAL_SAMPLES = 20

# Range nilai sensor kondisi NORMAL (lo, hi) — 5 sensor bearing
NORMAL_RANGE = {
    "noise_db":    (48,   55),
    "water_flow":  (50,   62),
    "air_flow":    (500,  700),
    "gaccx":       (0.54, 0.62),
    "outlet_temp": (100,  130),
}

# Range nilai sensor kondisi FAULT (lo, hi) — 5 sensor bearing
FAULT_RANGE = {
    "noise_db":    (58,   74),
    "water_flow":  (57,   62),
    "air_flow":    (650,  900),
    "gaccx":       (0.60, 0.73),
    "outlet_temp": (118,  145),
}
