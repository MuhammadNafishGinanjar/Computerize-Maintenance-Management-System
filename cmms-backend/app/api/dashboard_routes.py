# /cmms-backend/app/api/dashboard_routes.py
from flask import Blueprint, jsonify
from app.models import Asset, WorkOrder, MaintenanceSchedule, ComponentItem, AssetHealthStatus, ComplianceLog
import datetime
import math

dashboard_bp = Blueprint('dashboard_bp', __name__)

COMPONENT_LABELS = {
    "bearings": "Bearing",
    # Model Induksi & Forging sama-sama memakai satu target "status"
    # (kondisi keseluruhan mesin), bukan per-komponen seperti compressor.
    "status": "Status Mesin",
}

PRIORITY_ORDER = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'very_low': 0}


def get_predictive_maintenance_notifications():
    """Notifikasi predictive maintenance untuk komponen bearing per asset.

    Dibaca dari snapshot AssetHealthStatus yang sudah dihitung sekali saat
    data sensor masuk (lih. ml_routes.add_sensor_data) — endpoint ini TIDAK
    menjalankan predictor.predict() lagi, cukup query ringan tanpa index-scan
    berat, supaya aman dipanggil sesering apapun (termasuk polling notifikasi).
    """
    notifications = []

    try:
        for status in AssetHealthStatus.objects():
            components = status.components or {}

            # Kumpulkan komponen yang bermasalah (fault_prob > 0.3)
            faulty = []
            worst_priority = 0
            worst_risk = "very_low"

            for comp_key, comp_data in components.items():
                fault_prob = comp_data.get("failure_probability", 0)
                risk_level = comp_data.get("risk_level", "very_low")
                priority = comp_data.get("priority", "low")

                if fault_prob > 0.3:
                    faulty.append({
                        "key": comp_key,
                        "label": COMPONENT_LABELS.get(comp_key, comp_key),
                        "prediction": comp_data.get("prediction"),
                        "status": comp_data.get("status"),
                        "risk_level": risk_level,
                        "failure_probability": fault_prob,
                        "health_score": comp_data.get("health_score"),
                        "predicted_days": comp_data.get("predicted_days"),
                        "due_date": comp_data.get("due_date"),
                    })
                    if PRIORITY_ORDER.get(priority, 0) > worst_priority:
                        worst_priority = PRIORITY_ORDER.get(priority, 0)
                        worst_risk = risk_level

            if not faulty:
                continue

            worst_priority_label = {4: 'critical', 3: 'high', 2: 'medium', 1: 'low'}.get(worst_priority, 'low')

            notifications.append({
                "id": f"pred-{str(status.asset.id)}",
                "asset_id": str(status.asset.id),
                "machine_id": status.machine_id,
                "asset_name": status.asset_name,
                "type": "predictive_maintenance",
                "title": "Prediksi Maintenance Diperlukan",
                "message": status.recommendation or "",
                "priority": worst_priority_label,
                "risk_level": worst_risk,
                "overall_health_score": status.overall_health_score,
                "recommendation": status.recommendation or "",
                "faulty_components": faulty,
                "due_date": status.due_date,
                "predicted_days": status.predicted_days,
                "failure_probability": status.failure_probability,
                "health_score": status.health_score,
                "link": "/work-orders",
            })

        notifications.sort(
            key=lambda x: (PRIORITY_ORDER.get(x['priority'], 0), x['failure_probability'] or 0),
            reverse=True,
        )
        return notifications[:10]

    except Exception as e:
        print(f"Error getting predictive notifications: {e}")
        return notifications

@dashboard_bp.route('/stats', methods=['GET'])
def get_dashboard_stats():
    try:
        # --- 1. Statistik Aset ---
        total_assets = Asset.objects.count()
        down_assets = Asset.objects(status__in=['down', 'breakdown']).count()
        
        # --- 2. Statistik Inventaris (NEW) ---
        total_components = ComponentItem.objects.count()
        # Hitung komponen dengan stok di bawah ambang batasnya masing-masing
        low_stock_components = sum(
            1 for c in ComponentItem.objects.only('stock_quantity', 'low_stock_threshold')
            if c.stock_quantity < (c.low_stock_threshold if c.low_stock_threshold is not None else 5)
        )
        
        # --- 3. Statistik WO ---
        open_wo = WorkOrder.objects(status='open').count()
        in_progress_wo = WorkOrder.objects(status='in_progress').count()
        pending_verif_wo = WorkOrder.objects(status='pending_verification').count()
        completed_wo = WorkOrder.objects(status='completed').count()
        
        # --- 4. Jadwal Perawatan Terlewat dan Mendekati ---
        today = datetime.datetime.utcnow()
        next_week = today + datetime.timedelta(days=7)

        upcoming_schedules_raw = MaintenanceSchedule.objects(
            next_due_date__lte=next_week
        ).order_by('next_due_date')

        upcoming_schedules = []
        for sch in upcoming_schedules_raw:
            delta = sch.next_due_date - today
            days_left = math.ceil(delta.total_seconds() / 86400)
            schedule_status = "overdue" if days_left < 0 else "due_today" if days_left == 0 else "upcoming"

            upcoming_schedules.append({
                "id": str(sch.id),
                "task_name": sch.task_name,
                "asset_name": sch.asset.name if sch.asset else "Unknown Asset",
                "due_date": sch.next_due_date.isoformat(),
                "days_left": days_left,
                "status": schedule_status,
                "priority": "high" if days_left <= 3 or schedule_status == "overdue" else "medium"
            })

        # --- 4b. Kalibrasi Segera Jatuh Tempo (H-7, sama polanya dengan
        # upcoming_schedules di atas) ---
        # Batas bawah (now - 1 hari) sengaja dipasang supaya kalibrasi yang
        # baru saja lewat tapi belum sempat ditandai 'overdue' oleh
        # _auto_mark_overdue() (lih. compliance_routes.py) tetap kebagian
        # notifikasi H-7 ini, bukan langsung hilang dari radar.
        calib_window_start = today - datetime.timedelta(days=1)
        calib_window_end = today + datetime.timedelta(days=7)

        calibration_logs_raw = ComplianceLog.objects(
            status='pending',
            next_check_due__ne=None,
            next_check_due__gte=calib_window_start,
            next_check_due__lte=calib_window_end,
        ).order_by('next_check_due')

        calibration_notifications = []
        for log in calibration_logs_raw:
            delta = log.next_check_due - today
            days_left = math.ceil(delta.total_seconds() / 86400)
            asset_name = log.asset.name if log.asset else "Unknown Asset"

            if days_left < 0:
                message = f"{log.regulation_name} untuk {asset_name} terlambat {abs(days_left)} hari"
            elif days_left == 0:
                message = f"{log.regulation_name} untuk {asset_name} jatuh tempo hari ini"
            else:
                message = f"{log.regulation_name} untuk {asset_name} jatuh tempo dalam {days_left} hari"

            calibration_notifications.append({
                "id": f"calib-{str(log.id)}",
                "type": "calibration",
                "title": "Kalibrasi Segera Jatuh Tempo",
                "message": message,
                "link": "/compliance",
                "priority": "high" if days_left <= 3 else "medium",
                "date": log.next_check_due.isoformat(),
                "daysLeft": days_left,
            })

        # --- 5. List WO Verifikasi ---
        verification_list_raw = WorkOrder.objects(status='pending_verification').order_by('created_at').limit(5)
        verification_list = []
        for wo in verification_list_raw:
            verification_list.append({
                "id": str(wo.id),
                "title": wo.title,
                "asset_name": wo.asset.name if wo.asset else "Unknown",
                "technician": wo.assigned_to.name if wo.assigned_to else "Unassigned",
                "completed_at": (wo.completed_at or wo.created_at).isoformat() if (wo.completed_at or wo.created_at) else None
            })

        stats = {
            "total_assets": total_assets,
            "down_assets": down_assets,
            
            # Inventory Data (NEW)
            "total_components": total_components,
            "low_stock_components": low_stock_components,

            "open_work_orders": open_wo,
            "in_progress_work_orders": in_progress_wo,
            "pending_verification_orders": pending_verif_wo,
            "completed_work_orders": completed_wo,
            "total_work_orders": open_wo + in_progress_wo + pending_verif_wo + completed_wo,

            "upcoming_schedules": upcoming_schedules,
            "verification_needed_list": verification_list,

            # Kalibrasi H-7 (NEW)
            "calibration_notifications": calibration_notifications,

            # Predictive Maintenance Notifications (NEW)
            "predictive_maintenance_notifications": get_predictive_maintenance_notifications()
        }
        
        return jsonify(stats), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
