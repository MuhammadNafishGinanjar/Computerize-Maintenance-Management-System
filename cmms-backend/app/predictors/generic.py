"""
Predictor generik untuk model Hybrid DNN-SVM.

Semua predictor mesin (compressor, induksi, forging, bor) memakai logika
inferensi yang persis sama — yang berbeda hanya folder model, nama komponen,
label kelas, dan teks rekomendasi. Semua informasi itu SUDAH tersimpan di
dalam bundle .pkl hasil training (feature_columns, class_names, target_column),
sehingga tidak perlu lagi menulis file predictor baru untuk tiap mesin.

Cara pakai (mesin baru):
    1. Simpan hasil training ke:
         cmms-backend/ml_models/<folder>/
           - hybrid_model_<komponen>.pkl   (berisi scaler, svm, feature_columns,
                                            class_names)
           - dnn_extractor_<komponen>.keras
    2. Tambahkan satu entri di app/ml_registry.py → MACHINES.

Tidak perlu membuat file predictor baru, tidak perlu mengubah models.py.
"""
from datetime import datetime, timedelta
import warnings

import joblib
import numpy as np
import tensorflow as tf

from .base import BasePredictor

_RISK_ORDER = ["very_low", "low", "medium", "high", "critical"]

# Cache model per (folder, komponen) — dipakai bersama semua instance supaya
# file .pkl/.keras hanya dibaca sekali per proses.
_BUNDLE_CACHE: dict = {}
_EXTRACTOR_CACHE: dict = {}


class GenericHybridPredictor(BasePredictor):
    """Predictor Hybrid DNN-SVM yang dikonfigurasi lewat data, bukan subclass."""

    def __init__(
        self,
        folder,
        machine_label,
        components=None,
        component_names=None,
        ok_message=None,
        fault_message=None,
    ):
        """
        folder          : nama subfolder di "cmms-backend/ml_models/"
        machine_label   : nama mesin untuk teks rekomendasi (mis. "Mesin CNC")
        components      : daftar komponen; None = deteksi otomatis dari nama file
        component_names : {komponen: "Nama tampilan"} untuk teks rekomendasi
        ok_message      : teks rekomendasi saat semua komponen normal
        fault_message   : teks rekomendasi saat ada komponen fault (tanpa urgensi,
                          kalimat urgensi ditambahkan otomatis)
        """
        self.folder = folder
        self.machine_label = machine_label
        self.models_dir = self._ML_ROOT / folder / "models"
        self._components = list(components) if components else None
        self.component_names = component_names or {}
        self.ok_message = ok_message
        self.fault_message = fault_message

    # ── Komponen & file model ───────────────────────────────────────────────

    @property
    def components(self):
        """Daftar komponen; dideteksi dari nama file hybrid_model_*.pkl."""
        if self._components is None:
            if not self.models_dir.is_dir():
                return []
            self._components = sorted(
                p.stem.replace("hybrid_model_", "")
                for p in self.models_dir.glob("hybrid_model_*.pkl")
            )
        return self._components

    def _files_for(self, component):
        return [
            self.models_dir / f"hybrid_model_{component}.pkl",
            self.models_dir / f"dnn_extractor_{component}.keras",
        ]

    def is_ready(self):
        comps = self.components
        return bool(comps) and all(
            p.exists() for c in comps for p in self._files_for(c)
        )

    def missing_model_files(self):
        comps = self.components
        if not comps:
            return [str(self.models_dir / "hybrid_model_<komponen>.pkl")]
        return [str(p) for c in comps for p in self._files_for(c) if not p.exists()]

    def _ensure_loaded(self):
        if not self.is_ready():
            raise FileNotFoundError(
                f"Model {self.machine_label} belum lengkap: "
                + ", ".join(self.missing_model_files())
            )
        for component in self.components:
            key = (self.folder, component)
            if key not in _BUNDLE_CACHE:
                _BUNDLE_CACHE[key] = joblib.load(
                    self.models_dir / f"hybrid_model_{component}.pkl"
                )
            if key not in _EXTRACTOR_CACHE:
                _EXTRACTOR_CACHE[key] = tf.keras.models.load_model(
                    self.models_dir / f"dnn_extractor_{component}.keras"
                )

    def _bundle(self, component):
        return _BUNDLE_CACHE[(self.folder, component)]

    def _extractor(self, component):
        return _EXTRACTOR_CACHE[(self.folder, component)]

    def _labels(self, component):
        """Label {'ok': ..., 'fault': ...} diambil dari class_names di bundle."""
        names = self._bundle(component).get("class_names") or ["Ok", "Fault"]
        return {"ok": str(names[0]), "fault": str(names[-1])}

    # ── Fitur & validasi ────────────────────────────────────────────────────

    @property
    def feature_columns(self):
        self._ensure_loaded()
        return list(self._bundle(self.components[0])["feature_columns"])

    def validate_payload(self, payload):
        self._ensure_loaded()
        cols = self.feature_columns
        missing = [c for c in cols if c not in payload or payload[c] is None]
        invalid = []
        values = {}
        for col in cols:
            if col not in payload or payload[col] is None:
                continue
            try:
                values[col] = float(payload[col])
            except (TypeError, ValueError):
                invalid.append(col)
        return values, missing, invalid

    # ── Inferensi ───────────────────────────────────────────────────────────

    def predict(self, payload):
        self._ensure_loaded()
        values, missing, invalid = self.validate_payload(payload)

        if missing or invalid:
            return {
                "ok": False,
                "missing_features": missing,
                "invalid_features": invalid,
                "required_features": self.feature_columns,
            }

        x = np.array([[values[col] for col in self.feature_columns]], dtype=float)

        components = {}
        health_scores = []
        faulty_components = []

        for component in self.components:
            bundle = self._bundle(component)

            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message="X does not have valid feature names",
                    category=UserWarning,
                )
                scaled = bundle["scaler"].transform(x)

            latent = self._extractor(component).predict(scaled, verbose=0)
            svm = bundle["svm"]
            pred_value = int(svm.predict(latent)[0])
            proba = svm.predict_proba(latent)[0]
            ok_prob, fault_prob = float(proba[0]), float(proba[1])

            labels = self._labels(component)
            risk = self._build_component_risk(fault_prob)

            components[component] = {
                "prediction": labels["fault"] if pred_value == 1 else labels["ok"],
                "status": "Fault Detected" if pred_value == 1 else "Normal",
                "confidence": max(ok_prob, fault_prob),
                "probability": {labels["ok"]: ok_prob, labels["fault"]: fault_prob},
                "health_score": 1 - fault_prob,
                "failure_probability": fault_prob,
                "predicted_days": risk["predicted_days"],
                "risk_level": risk["risk_level"],
                "priority": risk["priority"],
                "due_date": risk["due_date"],
            }
            health_scores.append(1 - fault_prob)
            if pred_value == 1:
                faulty_components.append(component)

        worst = self._worst_risk(components)
        first = components[self.components[0]]

        return {
            "ok": True,
            "prediction": first["prediction"],
            "status": first["status"],
            "confidence": first["confidence"],
            "probability": first["probability"],
            "health_score": first["health_score"],
            "failure_probability": first["failure_probability"],
            "predicted_days": worst["predicted_days"],
            "risk_level": worst["risk_level"],
            "priority": worst["priority"],
            "recommendation": self._build_recommendation(faulty_components, components),
            "due_date": worst["due_date"],
            "components": components,
            "overall_health_score": sum(health_scores) / len(health_scores),
            "input_features": values,
        }

    # ── Risiko & rekomendasi ────────────────────────────────────────────────

    def _build_component_risk(self, fault_prob):
        if fault_prob >= 0.8:
            risk_level, priority, days = "critical", "critical", 0
        elif fault_prob >= 0.5:
            risk_level, priority, days = "high", "high", 7
        elif fault_prob >= 0.3:
            risk_level, priority, days = "medium", "medium", 30
        elif fault_prob >= 0.1:
            risk_level, priority, days = "low", "low", 60
        else:
            risk_level, priority, days = "very_low", "low", 90

        return {
            "risk_level": risk_level,
            "priority": priority,
            "predicted_days": days,
            "due_date": (datetime.utcnow() + timedelta(days=days)).isoformat(),
        }

    def _build_recommendation(self, faulty_components, components):
        if not faulty_components:
            return self.ok_message or (
                f"{self.machine_label} dalam kondisi baik. "
                "Lanjutkan operasi dan jadwalkan maintenance rutin."
            )

        worst_risk = max(
            (components[c]["risk_level"] for c in faulty_components),
            key=lambda r: _RISK_ORDER.index(r) if r in _RISK_ORDER else 0,
        )
        urgency = (
            "Lakukan pemeriksaan dan tindakan perbaikan segera."
            if worst_risk == "critical"
            else "Disarankan pemeriksaan dalam 7 hari ke depan."
            if worst_risk == "high"
            else "Disarankan pemeriksaan dalam 30 hari ke depan."
        )

        if self.fault_message:
            return f"{self.fault_message} {urgency}"

        names = [self.component_names.get(c, c) for c in faulty_components]
        label = (
            " dan ".join(names)
            if len(names) <= 2
            else f"{', '.join(names[:-1])}, dan {names[-1]}"
        )
        return f"{self.machine_label} — komponen {label} terindikasi fault. {urgency}"

    def _worst_risk(self, components):
        worst = max(
            components.values(),
            key=lambda c: _RISK_ORDER.index(c["risk_level"])
            if c["risk_level"] in _RISK_ORDER
            else 0,
        )
        return {
            k: worst[k]
            for k in ("risk_level", "priority", "predicted_days", "due_date")
        }
