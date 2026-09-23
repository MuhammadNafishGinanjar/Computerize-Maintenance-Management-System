"""
Base class untuk semua predictor mesin.
Setiap predictor mesin baru harus mewarisi class ini
dan mengimplementasikan semua method yang ada.
"""
from pathlib import Path
from abc import ABC, abstractmethod


# Urutan tingkat risiko, dari paling ringan ke paling berat.
RISK_ORDER = ["very_low", "low", "medium", "high", "critical"]


class BasePredictor(ABC):
    """Interface wajib yang harus diimplementasikan setiap predictor."""

    # Root folder machine-learning — di dalam cmms-backend/ml_models/
    # (ikut di-deploy ke Railway bersama backend)
    _ML_ROOT: Path = Path(__file__).resolve().parents[2] / "ml_models"

    @property
    @abstractmethod
    def feature_columns(self) -> list[str]:
        """Daftar nama kolom fitur input model, sesuai urutan."""

    @abstractmethod
    def is_ready(self) -> bool:
        """True jika semua file model tersedia."""

    @abstractmethod
    def missing_model_files(self) -> list[str]:
        """Daftar path file model yang belum ada."""

    @abstractmethod
    def predict(self, payload: dict) -> dict:
        """
        Jalankan inferensi.
        payload: dict berisi nilai sensor (key = nama fitur)
        Return: dict dengan minimal key 'ok' (bool)
        """

    # ── Dipakai ulang oleh health_smoothing ────────────────────────────────
    # Setelah health score dihaluskan, risk level & rekomendasi harus dihitung
    # ulang dari nilai yang sudah halus supaya konsisten. Dua wrapper di bawah
    # membungkus method internal tiap predictor (namanya sedikit berbeda antar
    # file lama) supaya pemanggilnya tidak perlu tahu detail itu.

    def build_risk(self, fault_prob: float) -> dict:
        """Risk level, priority, predicted_days, due_date dari fault probability."""
        return self._build_component_risk(fault_prob)

    def build_recommendation(self, faulty_components: list, components: dict) -> str:
        """Teks rekomendasi untuk daftar komponen yang terindikasi fault."""
        builder = getattr(self, "_build_recommendation", None) or getattr(
            self, "_build_aggregate_recommendation", None
        )
        if builder is None:
            return ""
        return builder(faulty_components, components)
