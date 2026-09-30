# /cmms-backend/app/api/compliance_routes.py
from flask import Blueprint, request, jsonify
from app.models import ComplianceLog, Asset 
from mongoengine.errors import DoesNotExist
from app import socketio
import datetime

# Buat Blueprint baru
compliance_bp = Blueprint('compliance_bp', __name__)


def _auto_mark_overdue():
    """Set status='overdue' untuk semua log 'pending' yang next_check_due-nya
    sudah lewat. Dipakai baik oleh endpoint manual (/logs/check-overdue)
    maupun otomatis tiap kali GET /logs dipanggil, supaya status selalu
    akurat berdasarkan tanggal — tidak lagi bergantung pada user mengklik
    tombol manual. next_check_due__ne=None sengaja dipasang supaya log yang
    belum punya tanggal jatuh tempo tidak ikut ke-overdue-kan."""
    updated = ComplianceLog.objects(
        status='pending',
        next_check_due__ne=None,
        next_check_due__lt=datetime.datetime.utcnow(),
    ).update(set__status='overdue')
    # Hanya emit bila ada yang berubah — GET /logs memanggil fungsi ini, dan
    # emit tanpa syarat akan memicu refetch GET /logs di semua klien tanpa henti.
    if updated:
        socketio.emit("compliance_updated", {})
    return updated


def _auto_create_next_cycles():
    """Buka siklus kalibrasi berikutnya (status 'pending', next_check_due
    kosong) untuk log 'compliant' yang jatuh temponya tinggal <= 7 hari
    (H-7) atau sudah lewat. Tidak membuat duplikat: dilewati kalau untuk
    aset+regulasi yang sama sudah ada siklus 'pending'/'overdue', atau
    sudah ada log yang lebih baru (log compliant lama tidak boleh memicu
    siklus baru lagi setelah siklusnya sendiri sudah dilanjutkan)."""
    threshold = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    due_logs = ComplianceLog.objects(
        status='compliant',
        next_check_due__ne=None,
        next_check_due__lte=threshold,
    )
    created = 0
    for log in due_logs:
        if not log.asset:
            continue
        existing = ComplianceLog.objects(
            asset=log.asset,
            regulation_name=log.regulation_name,
            status__in=['pending', 'overdue'],
        ).first()
        newer = ComplianceLog.objects(
            asset=log.asset,
            regulation_name=log.regulation_name,
            created_at__gt=log.created_at,
        ).first()
        if existing or newer:
            continue
        ComplianceLog(
            asset=log.asset,
            regulation_name=log.regulation_name,
            status='pending',
            next_check_due=None,
            certificate_image=None,
        ).save()
        created += 1
    # Satu emit setelah loop (bukan per save), dan hanya bila ada yang dibuat.
    if created:
        socketio.emit("compliance_updated", {})
    return created


# --- GET: Mendapatkan SEMUA Log Kepatuhan ---
@compliance_bp.route('/logs', methods=['GET'])
def get_compliance_logs():
    try:
        _auto_mark_overdue()
        _auto_create_next_cycles()
        logs = ComplianceLog.objects().order_by('next_check_due')
        return jsonify([log.to_json() for log in logs]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- PATCH: Cek & Tandai Log yang Sudah Lewat Jatuh Tempo ---
@compliance_bp.route('/logs/check-overdue', methods=['PATCH'])
def check_overdue_compliance_logs():
    try:
        updated_count = _auto_mark_overdue()
        return jsonify({"updated_count": updated_count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- GET: Riwayat Siklus Kalibrasi (semua record untuk 1 aset + regulasi) ---
@compliance_bp.route('/logs/history/<asset_id>/<regulation_name>', methods=['GET'])
def get_compliance_log_history(asset_id, regulation_name):
    try:
        try:
            asset = Asset.objects.get(id=asset_id)
        except DoesNotExist:
            return jsonify({"error": "Aset tidak ditemukan"}), 404

        logs = ComplianceLog.objects(
            asset=asset, regulation_name=regulation_name
        ).order_by('-created_at')
        return jsonify([log.to_json() for log in logs]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST: Membuat Log Kepatuhan BARU ---
@compliance_bp.route('/logs', methods=['POST'])
def create_compliance_log():
    try:
        data = request.get_json()
        
        if not data.get('asset_id') or not data.get('regulation_name'):
            return jsonify({"error": "Input tidak lengkap: asset_id dan regulation_name diperlukan"}), 400

        # Cari Aset
        try:
            asset = Asset.objects.get(id=data['asset_id'])
        except DoesNotExist:
            return jsonify({"error": "Aset tidak ditemukan"}), 404

        # Handle next_check_due date
        next_due = None
        if data.get('next_check_due'):
            try:
                next_due_date_only = datetime.datetime.fromisoformat(data['next_check_due'])
                next_due = next_due_date_only.replace(tzinfo=datetime.timezone.utc)
            except ValueError:
                 return jsonify({"error": "Format next_check_due salah."}), 400
        
        allowed_statuses = ['pending', 'compliant', 'overdue']
        if data.get('status') and data.get('status') not in allowed_statuses:
            return jsonify({"error": "Status tidak valid"}), 400

        # Status 'compliant' wajib disertai sertifikat sebagai bukti.
        if data.get('status') == 'compliant' and not data.get('certificate_image'):
            return jsonify({"error": "Sertifikat wajib diupload untuk status Compliant"}), 400

        # Buat Log Kepatuhan baru
        new_log = ComplianceLog(
            asset=asset,
            regulation_name=data['regulation_name'],
            status=data.get('status', 'pending'),
            next_check_due=next_due,
            evidence_document_url=data.get('evidence_document_url', ''),
            certificate_image=data.get('certificate_image') or None,
        )
        
        new_log.save()
        socketio.emit("compliance_updated", {})

        return jsonify(new_log.to_json()), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- GET Compliance Stats ---
@compliance_bp.route('/stats', methods=['GET'])
def get_compliance_stats():
    try:
        overdue_count = ComplianceLog.objects(status='overdue').count()
        pending_count = ComplianceLog.objects(status='pending').count()
        
        return jsonify({
            "overdue_count": overdue_count,
            "pending_count": pending_count
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- RUTE BARU: PATCH (Update Status) Log Kepatuhan ---
@compliance_bp.route('/logs/<log_id>', methods=['PATCH'])
def update_compliance_log(log_id):
    try:
        data = request.get_json()
        log = ComplianceLog.objects.get(id=log_id)

        certificate_image = data.get('certificate_image')
        has_update = False

        if 'status' in data:
            new_status = data['status'].lower()
            allowed_statuses = ['pending', 'compliant', 'overdue']

            if new_status not in allowed_statuses:
                return jsonify({"error": "Status tidak valid."}), 400

            # Sertifikat wajib disertakan saat menandai selesai — supaya
            # 'compliant' selalu punya bukti, bukan sekadar klik tombol.
            if new_status == 'compliant' and not certificate_image:
                return jsonify({"error": "Sertifikat wajib diupload saat menandai selesai"}), 400

            # Tanggal berlaku sertifikat wajib, supaya log compliant selalu
            # punya next_check_due (dipakai H-7 untuk membuka siklus berikutnya).
            # Di-parse & disimpan oleh blok next_check_due di bawah.
            if new_status == 'compliant' and not data.get('next_check_due'):
                return jsonify({"error": "Tanggal berlaku sertifikat wajib diisi"}), 400

            log.status = new_status
            has_update = True

        # Boleh upload ulang sertifikat tanpa ikut mengubah status.
        if certificate_image:
            log.certificate_image = certificate_image
            has_update = True

        # Boleh set/ubah jatuh tempo tanpa ikut mengubah status.
        if data.get('next_check_due'):
            try:
                due = datetime.datetime.fromisoformat(data['next_check_due'])
                log.next_check_due = due.replace(tzinfo=datetime.timezone.utc)
            except (ValueError, TypeError):
                return jsonify({"error": "Format next_check_due salah."}), 400
            has_update = True

        if not has_update:
            return jsonify({"message": "Tidak ada data yang diupdate"}), 200

        log.save()
        socketio.emit("compliance_updated", {})

        # Siklus berikutnya TIDAK dibuat di sini — dibuat otomatis oleh
        # GET /logs saat jatuh tempo log compliant tinggal <= 7 hari.
        return jsonify({"updated": log.to_json()}), 200

    except DoesNotExist:
        return jsonify({"error": "Log Kepatuhan tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500