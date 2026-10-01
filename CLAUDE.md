# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CMMS (Computerized Maintenance Management System) for manufacturing: asset tracking, work order
lifecycle, spare-parts inventory, and ML-based predictive maintenance (per-machine health scores
from sensor data). Decoupled architecture: Flask/MongoDB backend + React/Vite frontend, plus a
standalone sensor-simulator Flask app used for demos.

Directory layout:
- `cmms-backend/` — Flask REST API + Socket.IO
- `cmms-frontend/` — React 19 + Vite + Tailwind SPA
- `machine-learning filtered data/<folder>/models/` — trained ML model bundles per machine, read directly by the backend at inference time
- `Simulasi/Version 2/` — standalone Flask app that POSTs simulated sensor readings to the backend (mimics real sensor hardware)

## Common commands

### Backend (`cmms-backend/`)
```bash
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -r requirements.txt
python seed_data.py         # seed dummy assets/users/etc.
python seed_history.py      # seed historical WO/sensor data
python run.py                # runs on http://127.0.0.1:5000 (Flask + Socket.IO)
```
Set `FLASK_DEBUG=true` in `.env` for autoreload/debugger during dev (copy `.env.example` → `.env` first; never commit `.env`).

Verify a new machine's ML integration end-to-end before starting the server:
```bash
venv/Scripts/python.exe -m scripts.cek_mesin <MACHINE_ID>
```
`scripts/backfill_asset_health_status.py` backfills `AssetHealthStatus` snapshots for existing assets.

There is no automated test suite in this repo (no pytest/jest configured) — verification is done via
the `cek_mesin` script, manual API calls, and running the app.

### Frontend (`cmms-frontend/`)
```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173, proxies API calls to localhost:5000
npm run build
npm run lint       # eslint
npm run preview
```

### Simulator (`Simulasi/Version 2/simulasi-input data/`)
```bash
pip install -r requirements.txt
python app.py <profile>   # profile e.g. "bubut"; sets MACHINE_PROFILE before config.py loads it
```
Runs on `http://127.0.0.1:5050`. Deliberately does not run or display ML inference — it only POSTs
raw sensor payloads to the CMMS backend, so predictive logic stays server-side only.

## Architecture

### Auth model (not JWT)
Login returns a mock bearer token of the form `MOCK_TOKEN_SESUAI_ROLE_<ROLE>` (e.g.
`MOCK_TOKEN_SESUAI_ROLE_ADMIN`). `app/decorators.py::get_role_from_request()` parses the role
straight out of that token string — there's no session/JWT verification. The frontend stores
`{token, role, ...}` in `localStorage` under `cmms_user` and `services/api.js` attaches it as
`Authorization: Bearer <token>` on every request via an axios interceptor. Roles: `admin`,
`manager`, `technician`. The very first registered user always becomes `admin` (see
`auth_routes.py::register_user`).

### Work order lifecycle
`pending_approval → open → in_progress → pending_verification → completed`. Admin-created WOs start
`open`; manager-created WOs start `pending_approval` and need admin approval. Technicians can't
create WOs. Completion requires an uploaded evidence photo verified by admin/manager before status
flips to `completed` — inventory stock only decrements at that point (see `WorkOrder`/`Asset`
models and `wo_routes.py`).

### Predictive maintenance / ML pipeline
This is the most involved subsystem — read `cmms-backend/INTEGRASI_MESIN_BARU.md` (Indonesian)
before touching it.

- `app/ml_registry.py` maps `machine_id → predictor`. Two mechanisms coexist:
  - `REGISTRY`: 4 legacy machines (`CMP-DUMMY-001`, `IND-001`, `FRG-002`, `DRL-001`) each with a
    dedicated predictor class in `app/predictors/{compressor,induksi,forging,bor}.py`. **Don't
    touch these predictor files** — they predate the generic path and have machine-specific logic.
  - `MACHINES` dict: the fast path for any new machine. Adding a machine needs only one dict entry
    (`folder`, `label`, optional `component_names`/`ok_message`/`fault_message`/`aliases`) — no new
    predictor class, no `models.py` change, no frontend change. Backed by
    `app/predictors/generic.py::GenericHybridPredictor`, which reads feature names, component names,
    and class labels directly out of the trained `.pkl` bundle.
  - `app/predictors/base.py::BasePredictor` is the abstract interface every predictor (legacy or
    generic) implements: `feature_columns`, `is_ready()`, `missing_model_files()`, `predict()`, plus
    `build_risk()`/`build_recommendation()` helpers reused by `health_smoothing.py` and
    `demo_routes.py`.
- Model artifacts live in `machine-learning filtered data/<folder>/models/`: a
  `hybrid_model_<component>.pkl` (dict with `scaler`, `svm`, `feature_columns`, `class_names`,
  target/label metadata) plus a matching `dnn_extractor_<component>.keras` feature extractor.
  **`class_names[0]` must be the normal class and `[1]` the fault class** — the backend calls
  `predict_proba(...)[1]` as `failure_probability`. Feature-column names in the pickle must exactly
  match the sensor field names sent by simulator/device; use `aliases` in the registry entry instead
  of renaming columns post-training.
  wired via `app/api/ml_routes.py` (per-machine `aliases` are applied there).
- Unknown sensor fields with no dedicated column on `SensorData` land in its `raw_readings`
  `DictField` — you don't need to add a model field for prediction to work; only add one if you need
  to query/aggregate on that field specifically.
- Health scores are smoothed (`app/health_smoothing.py`, median filter over recent readings) before
  being written to `SensorData.health_score` / `AssetHealthStatus`, specifically so single sensor
  spikes don't crash the score. `SensorData.raw_health_score` keeps the unsmoothed model output for
  comparison/audit.
- `AssetHealthStatus` is a per-asset snapshot computed once when sensor data arrives
  (`ml_routes.add_sensor_data`) and simply read by dashboard/notifications afterward — it is not
  recomputed on every dashboard/stat request.

### Demo mode (`app/api/demo_routes.py`)
Lets the frontend's simulator UI directly slam an asset's health score to an arbitrary value via a
slider, bypassing normal smoothing — for live demos where waiting out the smoothing curve isn't
practical. Key invariants if you touch this: overridden snapshots are flagged `overridden=True`,
the pre-override snapshot is preserved in `pre_override` and restored verbatim on
`DELETE /api/demo/health-override/<machine_id>`, it never fabricates new `SensorData` rows, and
while override is active, incoming real sensor data must not overwrite the overridden health score
(but real sensor rows still get their true score recorded into `raw_health_score` so the actual
machine condition isn't lost). Toggle server-wide with `DEMO_MODE_ENABLED=0`.

### Real-time updates
`flask_socketio` (`app/__init__.py`) emits `sensor_data_update` and `machine_alert` events (e.g.
from `demo_routes.py` and the sensor ingestion path) consumed by the frontend's
`context/SocketProvider.jsx` — dashboard and sensor-monitoring pages update live without polling.

### CORS / environment config
`app/__init__.py::_get_cors_origins()` always allows `localhost:3000`/`5173` for dev; production
origins are added via comma-separated `CORS_EXTRA_ORIGINS` env var, not hardcoded. Mongo connection
params (`MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_DB_NAME`, `MONGO_HOST`, `MONGO_AUTH_DB`) and
`SECRET_KEY` also come from `.env` — see `.env.example` for the full list and defaults.

### Frontend structure
- `context/AuthProvider.jsx` + `useAuth.js` — auth state, backed by `localStorage['cmms_user']`.
- `context/SocketProvider.jsx` + `useSocket.js` — Socket.IO client wired to backend real-time events.
- `services/api.js` — single axios instance; `BASE_URL` comes from `VITE_API_BASE_URL` in prod
  (same-origin `/api` behind nginx) or falls back to `http://localhost:5000/api` in dev.
- `pages/SensorMonitoringPage.jsx` — renders per-machine sensor curves/health for any registered
  machine, including ones added purely through the `MACHINES` registry (unknown fields get
  auto-generated labels/colors; adding a `FIELD_META` entry there is cosmetic only, not required).
- `dummy-compressor/` — an in-browser fake sensor generator, separate from `Simulasi/`.
