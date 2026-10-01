"""
Form simulasi input data sensor — Version 2 (5 sensor komponen Bearing).

Aplikasi Flask kecil dan berdiri sendiri (terpisah dari cmms-frontend) yang
mengirim data sensor langsung ke backend CMMS lewat HTTP, persis seperti
perangkat sensor sungguhan di lapangan. Form ini SENGAJA tidak menampilkan
hasil prediksi ML — ia hanya mengirim data, bukan mengolahnya. Semua
pemrosesan ML dan tampilan health/risk tetap sepenuhnya ada di backend +
front-end CMMS, supaya jelas ML jalan di server CMMS, bukan di simulasi ini.

Jalankan:
    pip install -r requirements.txt
    python app.py

Lalu buka http://127.0.0.1:5050
"""

import os
import sys

import requests
from flask import Flask, jsonify, render_template, request

# Profil mesin boleh diberikan langsung sebagai argumen:
#     python app.py bubut
# Disediakan karena env var MACHINE_PROFILE gampang terlewat — ia hilang tiap
# kali terminal ditutup, dan kalau lupa disetel simulasi tetap jalan normal
# tetapi menunjuk mesin lain (profil default: compressor). Harus dipasang
# SEBELUM config diimpor, sebab config membaca env var itu saat diimpor.
if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
    os.environ["MACHINE_PROFILE"] = sys.argv[1].strip()

from config import (  # noqa: E402  (impor sengaja setelah env var disetel)
    CMMS_API_BASE, MACHINE_ID, DUMMY_ASSET, SENSOR_FIELDS, PRESETS, PROFILE_NAME,
    DEFAULT_PROFILE,
)

app = Flask(__name__)

# Backend CMMS yang di-hosting bisa "tidur" saat lama tidak dipakai, sehingga
# permintaan PERTAMA setelah idle gagal atau lambat (cold start) — di tengah
# presentasi itu tampil sebagai error meskipun servernya sebenarnya sehat.
# Karena itu timeout dilonggarkan dan kegagalan koneksi dicoba ulang sekali.
REQUEST_TIMEOUT = 25
RETRY_ON_CONNECTION_ERROR = 1


def _request(method, url, **kwargs):
    """requests.request dengan satu kali percobaan ulang saat koneksi gagal."""
    last_exc = None
    for attempt in range(RETRY_ON_CONNECTION_ERROR + 1):
        try:
            return requests.request(method, url, timeout=REQUEST_TIMEOUT, **kwargs)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_exc = exc
            if attempt < RETRY_ON_CONNECTION_ERROR:
                continue
            raise last_exc


def ensure_dummy_asset():
    """Pastikan aset dummy compressor sudah terdaftar di CMMS sebelum kirim data sensor."""
    try:
        res = _request("GET", f"{CMMS_API_BASE}/assets")
        res.raise_for_status()
        if any(a.get("machine_id") == MACHINE_ID for a in res.json()):
            return None
        create = _request("POST", f"{CMMS_API_BASE}/assets", json=DUMMY_ASSET)
        create.raise_for_status()
        return None
    except requests.exceptions.RequestException as exc:
        return str(exc)


def send_sensor_data(payload):
    """Kirim satu paket data sensor ke /api/ml/sensor-data. Return error (None jika sukses)."""
    try:
        res = _request("POST", f"{CMMS_API_BASE}/ml/sensor-data", json=payload)
    except requests.exceptions.ConnectionError:
        return "Tidak dapat terhubung ke backend CMMS. Pastikan server Flask backend berjalan."
    except requests.exceptions.Timeout:
        return f"Request timeout. Server tidak merespons dalam {REQUEST_TIMEOUT} detik."
    except requests.exceptions.RequestException as exc:
        return str(exc)

    if res.status_code >= 400:
        try:
            return res.json().get("error", f"HTTP {res.status_code}")
        except ValueError:
            return f"HTTP {res.status_code}"
    return None


@app.route("/", methods=["GET", "POST"])
def index():
    sent = False
    error = None
    machine_id = MACHINE_ID
    form_values = {key: str(default) for key, _, _, default in SENSOR_FIELDS}

    if request.method == "POST":
        machine_id = request.form.get("machine_id", MACHINE_ID).strip() or MACHINE_ID

        payload = {"machine_id": machine_id}
        invalid = []
        for key, *_ in SENSOR_FIELDS:
            raw = request.form.get(key, "").strip()
            form_values[key] = raw
            try:
                payload[key] = float(raw)
            except ValueError:
                invalid.append(key)

        if invalid:
            error = f"Field berikut harus berupa angka: {', '.join(invalid)}"
        else:
            asset_error = ensure_dummy_asset() if machine_id == MACHINE_ID else None
            if asset_error:
                error = f"Gagal menyiapkan aset di CMMS: {asset_error}"
            else:
                error = send_sensor_data(payload)
                sent = error is None

    return render_template(
        "index.html",
        fields=SENSOR_FIELDS,
        presets=PRESETS,
        machine_id=machine_id,
        form_values=form_values,
        sent=sent,
        error=error,
        api_base=CMMS_API_BASE,
    )


# ── Mode demo: slider health score ─────────────────────────────────────────
#
# Halaman terpisah berisi satu slider untuk menyetel health score mesin secara
# langsung, seperti mengatur volume. Dipakai saat presentasi supaya penurunan
# health score dan munculnya notifikasi bisa diperagakan seketika, tanpa perlu
# mengirim belasan pembacaan sensor dan menunggu smoothing di backend.
#
# Sakelar on/off-nya ada DI SINI (halaman simulasi), bukan di web CMMS. Selama
# slider tidak dinyalakan, backend CMMS tidak menerima override apa pun.
#
# Permintaan dari browser dikirim ke Flask ini dulu, baru diteruskan ke CMMS —
# supaya tidak terganjal CORS saat backend CMMS berjalan di domain berbeda.


def _forward(method, path, **kwargs):
    """Teruskan satu request ke backend CMMS. Return (body_dict, status_code)."""
    try:
        res = _request(method, f"{CMMS_API_BASE}{path}", **kwargs)
    except requests.exceptions.ConnectionError:
        return {"error": "Tidak dapat terhubung ke backend CMMS."}, 502
    except requests.exceptions.Timeout:
        return {
            "error": f"Server tidak merespons dalam {REQUEST_TIMEOUT} detik. "
                     "Coba geser slider sekali lagi."
        }, 504
    except requests.exceptions.RequestException as exc:
        return {"error": str(exc)}, 502

    try:
        return res.json(), res.status_code
    except ValueError:
        return {"error": f"HTTP {res.status_code}"}, res.status_code


@app.route("/send-sensor", methods=["POST"])
def send_sensor():
    """Endpoint JSON untuk mode Continuous — dipanggil AJAX dari index.html.

    Body: { "machine_id": "...", "<field>": <float>, ... }
    Response: { "ok": true } atau { "ok": false, "error": "..." }
    """
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"ok": False, "error": "Body JSON tidak valid."}), 400

    machine_id = payload.get("machine_id", "").strip() or MACHINE_ID

    # Validasi: setiap field sensor harus bisa di-cast ke float
    clean = {"machine_id": machine_id}
    for key, *_ in SENSOR_FIELDS:
        val = payload.get(key)
        if val is None:
            return jsonify({"ok": False, "error": f"Field '{key}' wajib ada."}), 400
        try:
            clean[key] = float(val)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": f"Field '{key}' harus berupa angka."}), 400

    asset_error = ensure_dummy_asset() if machine_id == MACHINE_ID else None
    if asset_error:
        return jsonify({"ok": False, "error": f"Gagal menyiapkan aset: {asset_error}"}), 502

    err = send_sensor_data(clean)
    if err:
        return jsonify({"ok": False, "error": err}), 502

    return jsonify({"ok": True})


@app.route("/health-demo")
def health_demo():
    return render_template(
        "health_demo.html",
        machine_id=MACHINE_ID,
        machine_name=DUMMY_ASSET.get("name", MACHINE_ID),
        api_base=CMMS_API_BASE,
    )


@app.route("/health-override", methods=["GET", "POST", "DELETE"])
def health_override():
    machine_id = (
        request.args.get("machine_id")
        or (request.get_json(silent=True) or {}).get("machine_id")
        or MACHINE_ID
    )

    if request.method == "GET":
        body, code = _forward("GET", f"/demo/health-override/{machine_id}")
    elif request.method == "DELETE":
        body, code = _forward("DELETE", f"/demo/health-override/{machine_id}")
    else:
        payload = request.get_json(silent=True) or {}
        body, code = _forward("POST", "/demo/health-override", json={
            "machine_id": machine_id,
            "health_score": payload.get("health_score"),
        })

    return jsonify(body), code


if __name__ == "__main__":
    # Cetak profil yang sedang aktif. Tanpa ini, lupa menyetel MACHINE_PROFILE
    # tidak terlihat sampai data terlanjur terkirim ke mesin yang salah —
    # simulasi tetap jalan normal, hanya menunjuk mesin lain.
    print()
    print("=" * 64)
    print(f"  Profil mesin : {PROFILE_NAME}")
    print(f"  Machine ID   : {MACHINE_ID}  ({DUMMY_ASSET.get('name', '-')})")
    print(f"  Backend CMMS : {CMMS_API_BASE}")
    print("-" * 64)
    print("  Form sensor  : http://127.0.0.1:5050/")
    print("  Slider demo  : http://127.0.0.1:5050/health-demo")

    if PROFILE_NAME != DEFAULT_PROFILE:
        # Profil non-bawaan hanya bisa terjadi kalau diminta sengaja lewat
        # argumen/env var. Tetap diberi peringatan mencolok supaya sisa setelan
        # dari sesi sebelumnya tidak lolos tanpa disadari saat presentasi.
        print("=" * 64)
        print(f"  PERHATIAN: ini BUKAN profil bawaan ({DEFAULT_PROFILE}).")
        print(f"  Data & slider akan mengarah ke {MACHINE_ID}, bukan mesin bubut.")
        print("  Hentikan (Ctrl+C) lalu jalankan `python app.py` tanpa argumen")
        print("  kalau yang Anda maksud mesin bubut.")

    print("=" * 64)
    print()

    app.run(host="0.0.0.0", port=5050, debug=True)
