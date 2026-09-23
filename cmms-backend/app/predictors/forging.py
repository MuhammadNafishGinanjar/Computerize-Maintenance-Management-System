from datetime import datetime, timedelta
import warnings

import joblib
import numpy as np
import tensorflow as tf

from .base import BasePredictor


COMPONENTS = ["status"]

COMPONENT_LABELS = {
    "status": {"fault": "Fault", "ok": "Ok"},
}

COMPONENT_NAME_ID = {
    "status": "Sistem Hidrolik & Getaran Forging",
}

_RISK_ORDER = ["very_low", "low", "medium", "high", "critical"]


class ForgingPredictor(BasePredictor):
    """Hybrid DNN-SVM predictor untuk mesin forging — status tekanan & getaran."""

    _bundles: dict = {}
    _extractors: dict = {}

    def __init__(self):
        # model ada di: machine-learning filtered data/forging/models/
        self.models_dir = self._ML_ROOT / "forging"

    @property
    def feature_columns(self):
        self._ensure_loaded()
        return list(self._bundles["status"]["feature_columns"])

    def is_ready(self):
        return all(
            (self.models_dir / f"hybrid_model_{c}.pkl").exists()
            and (self.models_dir / f"dnn_extractor_{c}.keras").exists()
            for c in COMPONENTS
        )

    def missing_model_files(self):
        missing = []
        for c in COMPONENTS:
            for fname in [f"hybrid_model_{c}.pkl", f"dnn_extractor_{c}.keras"]:
                p = self.models_dir / fname
                if not p.exists():
                    missing.append(str(p))
        return missing

    def validate_payload(self, payload):
        self._ensure_loaded()
        missing = [col for col in self.feature_columns
                   if col not in payload or payload[col] is None]
        invalid = []
        values = {}
        for col in self.feature_columns:
            if col not in payload or payload[col] is None:
                continue
            try:
                values[col] = float(payload[col])
            except (TypeError, ValueError):
                invalid.append(col)
        return values, missing, invalid

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

        ordered = [values[col] for col in self.feature_columns]
        x = np.array([ordered], dtype=float)

        components = {}
        health_scores = []
        faulty_components = []

        for component in COMPONENTS:
            bundle = self._bundles[component]
            extractor = self._extractors[component]

            with warnings.catch_warnings():
                warnings.filterwarnings(
                    "ignore",
                    message="X does not have valid feature names",
                    category=UserWarning,
                )
                scaled = bundle["scaler"].transform(x)

            latent = extractor.predict(scaled, verbose=0)
            svm = bundle["svm"]
            pred_value = int(svm.predict(latent)[0])
            proba = svm.predict_proba(latent)[0]
            fault_prob = float(proba[1])
            ok_prob = float(proba[0])

            labels = COMPONENT_LABELS[component]
            prediction = labels["fault"] if pred_value == 1 else labels["ok"]
            risk = self._build_component_risk(fault_prob)
            comp_health = 1 - fault_prob

            components[component] = {
                "prediction": prediction,
                "status": "Fault Detected" if pred_value == 1 else "Normal",
                "confidence": max(ok_prob, fault_prob),
                "probability": {labels["ok"]: ok_prob, labels["fault"]: fault_prob},
                "health_score": comp_health,
                "failure_probability": fault_prob,
                "predicted_days": risk["predicted_days"],
                "risk_level": risk["risk_level"],
                "priority": risk["priority"],
                "due_date": risk["due_date"],
            }
            health_scores.append(comp_health)

            if pred_value == 1:
                faulty_components.append(component)

        overall_health = sum(health_scores) / len(health_scores)
        recommendation = self._build_aggregate_recommendation(faulty_components, components)
        worst = self._worst_risk(components)

        s = components["status"]
        return {
            "ok": True,
            "prediction": s["prediction"],
            "status": s["status"],
            "confidence": s["confidence"],
            "probability": s["probability"],
            "health_score": s["health_score"],
            "failure_probability": s["failure_probability"],
            "predicted_days": worst["predicted_days"],
            "risk_level": worst["risk_level"],
            "priority": worst["priority"],
            "recommendation": recommendation,
            "due_date": worst["due_date"],
            "components": components,
            "overall_health_score": overall_health,
            "input_features": values,
        }

    def _ensure_loaded(self):
        if not self.is_ready():
            raise FileNotFoundError(
                "Forging model files are missing: "
                + ", ".join(self.missing_model_files())
            )

        for component in COMPONENTS:
            if component not in ForgingPredictor._bundles:
                ForgingPredictor._bundles[component] = joblib.load(
                    self.models_dir / f"hybrid_model_{component}.pkl"
                )
            if component not in ForgingPredictor._extractors:
                ForgingPredictor._extractors[component] = tf.keras.models.load_model(
                    self.models_dir / f"dnn_extractor_{component}.keras"
                )

        self._bundles = ForgingPredictor._bundles
        self._extractors = ForgingPredictor._extractors

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

        due_date = (datetime.utcnow() + timedelta(days=days)).isoformat()
        return {"risk_level": risk_level, "priority": priority, "predicted_days": days, "due_date": due_date}

    def _build_aggregate_recommendation(self, faulty_components, components):
        if not faulty_components:
            return (
                "Mesin forging dalam kondisi baik (tekanan hidrolik dan getaran normal). "
                "Lanjutkan operasi dan jadwalkan maintenance rutin."
            )

        comp = components["status"]
        risk = comp["risk_level"]
        urgency = (
            "Lakukan pemeriksaan dan tindakan perbaikan segera." if risk == "critical"
            else "Disarankan pemeriksaan dalam 7 hari ke depan." if risk == "high"
            else "Disarankan pemeriksaan dalam 30 hari ke depan."
        )
        return (
            "Mesin forging terindikasi fault — periksa tekanan hidrolik dan "
            f"getaran pada die set/guide bushing. {urgency}"
        )

    def _worst_risk(self, components):
        worst = max(
            components.values(),
            key=lambda c: _RISK_ORDER.index(c["risk_level"]) if c["risk_level"] in _RISK_ORDER else 0,
        )
        return {
            "risk_level": worst["risk_level"],
            "priority": worst["priority"],
            "predicted_days": worst["predicted_days"],
            "due_date": worst["due_date"],
        }
