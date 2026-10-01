# /cmms-backend/app/api/asset_routes.py
from flask import Blueprint, request, jsonify
from app import socketio
from app.models import Asset, ComponentItem
from mongoengine.errors import NotUniqueError, DoesNotExist

assets_bp = Blueprint('assets_bp', __name__)

# --- GET: Mendapatkan SEMUA Aset ---
@assets_bp.route('/assets', methods=['GET'])
def get_assets():
    try:
        assets = Asset.objects()
        return jsonify([asset.to_json() for asset in assets]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- POST: Membuat Aset BARU ---
@assets_bp.route('/assets', methods=['POST'])
def create_asset():
    try:
        data = request.get_json()
        
        if not data.get('name') or not data.get('machine_id'):
            return jsonify({"error": "Nama Mesin dan ID Mesin diperlukan"}), 400

        component_list = []
        if 'component_ids' in data and isinstance(data['component_ids'], list):
            for comp_id in data['component_ids']:
                try:
                    comp_item = ComponentItem.objects.get(id=comp_id)
                    component_list.append(comp_item)
                except DoesNotExist:
                    return jsonify({"error": f"Komponen dengan ID {comp_id} tidak ditemukan."}), 404

        new_asset = Asset(
            name=data['name'],
            machine_id=data['machine_id'],
            location=data.get('location', ''),
            # --- SIMPAN GAMBAR & STATUS ---
            image=data.get('image', ''), 
            status=data.get('status', 'running'), # Default running jika tidak dikirim
            # ------------------------------
            components=component_list
        )
        
        new_asset.save()
        socketio.emit("asset_updated", {})
        return jsonify(new_asset.to_json()), 201
        
    except NotUniqueError:
        return jsonify({"error": "ID Mesin sudah ada. Gunakan ID unik."}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- PATCH (Edit) Aset ---
@assets_bp.route('/assets/<asset_id>', methods=['PATCH'])
def update_asset(asset_id):
    try:
        data = request.get_json()
        asset = Asset.objects.get(id=asset_id)

        if 'name' in data:
            asset.name = data['name']
        if 'machine_id' in data:
            if data['machine_id'] != asset.machine_id:
                if Asset.objects(machine_id=data['machine_id']).first():
                    return jsonify({"error": "ID Mesin sudah digunakan."}), 400
            asset.machine_id = data['machine_id']
        if 'location' in data:
            asset.location = data['location']
            
        # Update Status
        if 'status' in data:
            asset.status = data['status']
        
        # Update Gambar
        if 'image' in data:
            asset.image = data['image']
        
        # Update Komponen
        if 'component_ids' in data:
            component_list = []
            for comp_id in data['component_ids']:
                try:
                    comp_item = ComponentItem.objects.get(id=comp_id)
                    component_list.append(comp_item)
                except DoesNotExist:
                    continue 
            asset.components = component_list

        asset.save()
        socketio.emit("asset_updated", {})
        return jsonify(asset.to_json()), 200

    except DoesNotExist:
        return jsonify({"error": "Aset tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- DELETE (Hapus) Aset ---
@assets_bp.route('/assets/<asset_id>', methods=['DELETE'])
def delete_asset(asset_id):
    try:
        asset = Asset.objects.get(id=asset_id)
        asset.delete()
        socketio.emit("asset_updated", {})
        return jsonify({"message": f"Aset '{asset.name}' berhasil dihapus."}), 200
    except DoesNotExist:
        return jsonify({"error": "Aset tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- GET: Machine Monitoring (Monitoring Mesin) ---
@assets_bp.route('/assets/monitoring/dashboard', methods=['GET'])
def get_machine_monitoring():
    """
    Endpoint untuk monitoring mesin dengan status dan statistik.
    Status yang didukung: running, idle, breakdown, off, maintenance, warning

    'down' adalah alias lama untuk 'breakdown' — keduanya dihitung sebagai satu
    status supaya halaman Machine Monitoring tidak menampilkan dua kartu "Rusak"
    dengan jumlah yang terpecah.
    """
    try:
        all_assets = Asset.objects()

        # Alias status lama -> status kanonik
        STATUS_ALIASES = {'down': 'breakdown'}

        # Hitung statistik berdasarkan status
        status_stats = {
            'running': 0,
            'idle': 0,
            'breakdown': 0,
            'off': 0,
            'maintenance': 0,
            'warning': 0,
        }

        assets_with_details = []
        for asset in all_assets:
            status = asset.status if asset.status else 'running'
            status = STATUS_ALIASES.get(status, status)

            # Update statistik
            if status in status_stats:
                status_stats[status] += 1

            # Hitung WO pending untuk aset ini
            pending_wo_count = 0
            try:
                from app.models import WorkOrder
                pending_wo_count = WorkOrder.objects(
                    asset=asset, 
                    status__in=['pending_verification', 'pending_approval']
                ).count()
            except:
                pending_wo_count = 0
            
            asset_data = asset.to_json()
            asset_data['pending_wo_count'] = pending_wo_count
            assets_with_details.append(asset_data)
        
        return jsonify({
            "total_machines": len(all_assets),
            "status_summary": status_stats,
            "assets": assets_with_details
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- PATCH: Update Machine Status ---
@assets_bp.route('/assets/<asset_id>/status', methods=['PATCH'])
def update_machine_status(asset_id):
    """
    Update status mesin (running, idle, breakdown, off, maintenance, warning)
    """
    try:
        data = request.get_json()
        asset = Asset.objects.get(id=asset_id)
        
        allowed_statuses = ['running', 'idle', 'breakdown', 'off', 'maintenance', 'warning', 'down']
        new_status = data.get('status', '').lower()
        
        if new_status not in allowed_statuses:
            return jsonify({
                "error": f"Status tidak valid. Status yang diizinkan: {', '.join(allowed_statuses)}"
            }), 400
        
        asset.status = new_status
        asset.save()
        socketio.emit("asset_updated", {})

        return jsonify({
            "message": f"Status mesin '{asset.name}' diperbarui menjadi '{new_status}'",
            "asset": asset.to_json()
        }), 200
        
    except DoesNotExist:
        return jsonify({"error": "Aset tidak ditemukan"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500