# /cmms-backend/app/models.py
from . import db, bcrypt
import datetime

# --- Sub-dokumen untuk Komponen ---
class Component(db.EmbeddedDocument):
    name = db.StringField(required=True)
    part_number = db.StringField()
    last_checked = db.DateTimeField()

# --- Model Inventaris Gudang ---
class ComponentItem(db.Document):
    name = db.StringField(required=True, unique=True)
    part_number = db.StringField()
    stock_quantity = db.IntField(default=0)
    location = db.StringField(default='Gudang Utama')
    low_stock_threshold = db.IntField(default=5)

    def to_json(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "part_number": self.part_number,
            "stock_quantity": self.stock_quantity,
            "location": self.location,
            "low_stock_threshold": self.low_stock_threshold if self.low_stock_threshold is not None else 5
        }

# --- Model Utama Aset (Mesin) ---
class Asset(db.Document):
    name = db.StringField(required=True)
    machine_id = db.StringField(unique=True, required=True)
    location = db.StringField()
    status = db.StringField(default='running')
    
    # --- FIELD BARU: Gambar Aset ---
    image = db.StringField() # Base64 string
    # -----------------------------

    components = db.ListField(db.ReferenceField(ComponentItem))
    maintenance_history = db.ListField(db.ReferenceField('WorkOrder'))
    
    def to_json(self):
        component_list = []
        for comp in self.components:
            if comp: 
                component_list.append({
                    "id": str(comp.id),
                    "name": comp.name,
                    "stock_quantity": comp.stock_quantity
                })
        return {
            "id": str(self.id),
            "name": self.name,
            "machine_id": self.machine_id,
            "location": self.location,
            "status": self.status,
            "image": self.image, 
            "components": component_list 
        }

# --- Model User ---
class User(db.Document):
    name = db.StringField(required=True)
    email = db.StringField(unique=True, required=True)
    password = db.StringField(required=True) 
    role = db.StringField(default='technician')

    def set_password(self, password):
        self.password = bcrypt.generate_password_hash(password).decode('utf-8')
    
    def check_password(self, password):
        return bcrypt.check_password_hash(self.password, password)

    def to_json(self):
        return {
            "id": str(self.id),
            "name": self.name,
            "email": self.email,
            "role": self.role
        }

# --- Model Work Order ---
class WorkOrder(db.Document):
    title = db.StringField(required=True)
    description = db.StringField()
    
    # Status flow: pending_approval -> open -> in_progress -> pending_verification -> completed
    status = db.StringField(default='open') 
    
    priority = db.StringField(default='medium')
    type = db.StringField()
    component = db.ReferenceField(ComponentItem) 
    asset = db.ReferenceField(Asset, required=True)
    assigned_to = db.ReferenceField(User)
    
    # Role pembuat (admin/manager)
    created_by_role = db.StringField() 
    
    # Foto saat pembuatan (Masalah/Pencegahan)
    initial_image = db.StringField() 
    
    # Foto saat selesai (Bukti Perbaikan)
    evidence_image = db.StringField() 
    
    created_at = db.DateTimeField(default=datetime.datetime.utcnow)
    due_date = db.DateTimeField()
    completed_at = db.DateTimeField()

    def to_json(self, include_images=True):
        user_name = self.assigned_to.name if self.assigned_to else ""
        asset_name = self.asset.name if self.asset else "Aset Tidak Ditemukan"
        asset_id = str(self.asset.id) if self.asset else None
        component_name = self.component.name if self.component else ""
        component_id = str(self.component.id) if self.component else None

        data = {
            "id": str(self.id),
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "type": self.type,
            "component_id": component_id,
            "component_name": component_name,
            "asset_id": asset_id,
            "asset_name": asset_name,
            "assigned_to": user_name,
            "created_by_role": self.created_by_role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

        if include_images:
            data["initial_image"] = self.initial_image
            data["evidence_image"] = self.evidence_image
        else:
            # List view tidak perlu payload gambar (bisa MB per WO) — dipakai
            # frontend hanya untuk menandai ada/tidaknya bukti foto.
            data["has_initial_image"] = bool(self.initial_image)
            data["has_evidence_image"] = bool(self.evidence_image)

        return data

# --- Model Maintenance Schedule ---
class MaintenanceSchedule(db.Document):
    asset = db.ReferenceField(Asset, required=True)
    task_name = db.StringField()
    frequency = db.StringField()
    frequency_days = db.IntField()
    next_due_date = db.DateTimeField()
    description_template = db.StringField()
    component = db.StringField() 

    def to_json(self):
        asset_name = self.asset.name if self.asset else "Aset Tidak Ditemukan"
        return {
            "id": str(self.id),
            "asset_id": str(self.asset.id),
            "asset_name": asset_name,
            "task_name": self.task_name,
            "frequency": self.frequency,
            "frequency_days": self.frequency_days,
            "next_due_date": self.next_due_date.isoformat() if self.next_due_date else None,
            "description_template": self.description_template,
            "component": self.component
        }

# --- Model Compliance Log ---
class ComplianceLog(db.Document):
    asset = db.ReferenceField(Asset, required=True)
    regulation_name = db.StringField()
    status = db.StringField(default='pending')
    next_check_due = db.DateTimeField()
    evidence_document_url = db.StringField()

    # Sertifikat/bukti kalibrasi (base64), sama pendekatannya dengan
    # WorkOrder.initial_image/evidence_image. Wajib diisi saat status
    # ditandai 'compliant' — lih. compliance_routes.update_compliance_log.
    certificate_image = db.StringField()

    created_at = db.DateTimeField(default=datetime.datetime.utcnow)

    def to_json(self):
        asset_name = self.asset.name if self.asset else "Aset Tidak Ditemukan"
        return {
            "id": str(self.id),
            "asset_id": str(self.asset.id),
            "asset_name": asset_name,
            "regulation_name": self.regulation_name,
            "status": self.status,
            "next_check_due": self.next_check_due.isoformat() if self.next_check_due else None,
            "evidence_document_url": self.evidence_document_url,
            "certificate_image": self.certificate_image or None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

# --- Model Template Aset ---
class AssetTemplate(db.Document):
    name = db.StringField(required=True, unique=True)
    components = db.ListField(db.ReferenceField(ComponentItem))

    def to_json(self):
        component_ids = [str(comp.id) for comp in self.components if comp]
        return {
            "id": str(self.id),
            "name": self.name,
            "component_ids": component_ids
        }

# --- Model Data Sensor untuk Predictive Maintenance ---
class SensorData(db.Document):
    asset = db.ReferenceField(Asset, required=True)
    timestamp = db.DateTimeField(default=datetime.datetime.utcnow)
    
    # Metrik sensor (sesuaikan dengan jenis mesin)
    temperature = db.FloatField()  # Suhu (°C)
    vibration = db.FloatField()    # Getaran (mm/s²)
    pressure = db.FloatField()     # Tekanan (bar)
    current = db.FloatField()      # Arus (A)
    voltage = db.FloatField()      # Tegangan (V)
    rpm = db.FloatField()          # Putaran per menit

    # Fitur sensor khusus model compressor bearing
    motor_power = db.FloatField()
    torque = db.FloatField()
    outlet_pressure_bar = db.FloatField()
    air_flow = db.FloatField()
    noise_db = db.FloatField()
    outlet_temp = db.FloatField()
    wpump_outlet_press = db.FloatField()
    water_inlet_temp = db.FloatField()
    water_outlet_temp = db.FloatField()
    wpump_power = db.FloatField()
    water_flow = db.FloatField()
    oilpump_power = db.FloatField()
    oil_tank_temp = db.FloatField()
    gaccx = db.FloatField()
    gaccy = db.FloatField()
    gaccz = db.FloatField()
    haccx = db.FloatField()
    haccy = db.FloatField()
    haccz = db.FloatField()

    # Fitur sensor khusus model Induksi (status papan kontrol)
    active_power_w = db.FloatField()
    current_a = db.FloatField()
    energy_kwh = db.FloatField()
    temp_c = db.FloatField()
    voltage_v = db.FloatField()

    # Fitur sensor khusus model Forging (status mesin tempa)
    tekanan_bar = db.FloatField()
    vx = db.FloatField()
    vy = db.FloatField()
    vz = db.FloatField()

    # Tampung sensor mesin lain yang belum punya field resmi (mis. dx/dy/dz, fx/fy/fz)
    raw_readings = db.DictField()

    # Status kesehatan (0-1, dihitung oleh ML). Tanpa default — None berarti
    # belum ada prediksi ML untuk data ini (mis. mesin belum punya model
    # terdaftar), supaya tidak tercampur dengan hasil prediksi 100% asli.
    # Nilai ini sudah DIHALUSKAN (lih. app/health_smoothing.py) supaya satu
    # spike sensor tidak menjatuhkan health score ke 0 seketika.
    health_score = db.FloatField()

    # Health score mentah langsung dari model, sebelum dihaluskan — disimpan
    # untuk audit/perbandingan (kurva mentah vs kurva halus).
    raw_health_score = db.FloatField()
    
    # Prediksi failure
    predicted_failure_days = db.FloatField()  # Hari sampai failure
    failure_probability = db.FloatField()     # Probabilitas failure (0-1)

    meta = {
        # Query paling umum: data sensor terbaru milik satu asset, diurutkan
        # descending by timestamp. Tanpa index ini MongoDB collection-scan +
        # in-memory sort seluruh koleksi tiap kali dipanggil (lih. get_predictive
        # dashboard & get_sensor_history) — makin lambat seiring data bertambah.
        'indexes': [('asset', '-timestamp')]
    }

    def to_json(self):
        return {
            "id": str(self.id),
            "asset_id": str(self.asset.id),
            "asset_name": self.asset.name,
            "timestamp": self.timestamp.isoformat(),
            "temperature": self.temperature,
            "vibration": self.vibration,
            "pressure": self.pressure,
            "current": self.current,
            "voltage": self.voltage,
            "rpm": self.rpm,
            "motor_power": self.motor_power,
            "torque": self.torque,
            "outlet_pressure_bar": self.outlet_pressure_bar,
            "air_flow": self.air_flow,
            "noise_db": self.noise_db,
            "outlet_temp": self.outlet_temp,
            "wpump_outlet_press": self.wpump_outlet_press,
            "water_inlet_temp": self.water_inlet_temp,
            "water_outlet_temp": self.water_outlet_temp,
            "wpump_power": self.wpump_power,
            "water_flow": self.water_flow,
            "oilpump_power": self.oilpump_power,
            "oil_tank_temp": self.oil_tank_temp,
            "gaccx": self.gaccx,
            "gaccy": self.gaccy,
            "gaccz": self.gaccz,
            "haccx": self.haccx,
            "haccy": self.haccy,
            "haccz": self.haccz,
            "active_power_w": self.active_power_w,
            "current_a": self.current_a,
            "energy_kwh": self.energy_kwh,
            "temp_c": self.temp_c,
            "voltage_v": self.voltage_v,
            "tekanan_bar": self.tekanan_bar,
            "vx": self.vx,
            "vy": self.vy,
            "vz": self.vz,
            "raw_readings": self.raw_readings,
            "health_score": self.health_score,
            "raw_health_score": self.raw_health_score,
            "predicted_failure_days": self.predicted_failure_days,
            "failure_probability": self.failure_probability
        }

# --- Model Snapshot Kesehatan Aset (hasil ML terbaru, per asset) ---
# Dihitung SEKALI saat data sensor masuk (lih. ml_routes.add_sensor_data),
# lalu tinggal dibaca oleh dashboard/notifikasi — bukan dihitung ulang
# (predictor.predict) setiap kali stats/notifikasi diminta.
class AssetHealthStatus(db.Document):
    asset = db.ReferenceField(Asset, required=True, unique=True)
    machine_id = db.StringField()
    asset_name = db.StringField()

    overall_health_score = db.FloatField()
    health_score = db.FloatField()
    failure_probability = db.FloatField()
    predicted_days = db.FloatField()
    risk_level = db.StringField()
    priority = db.StringField()
    recommendation = db.StringField()
    due_date = db.StringField()

    # Breakdown per-komponen (mis. bearing) — bentuknya sama dengan
    # CompressorPredictor.predict()["components"]
    components = db.DictField()

    # State filter median milik health_smoothing: {komponen: [health mentah
    # beberapa pembacaan terakhir]}. Internal, tidak dikirim ke front-end.
    raw_history = db.DictField()

    # --- Mode demo (lih. app/api/demo_routes.py) --------------------------
    # Dipakai HANYA saat health score di-override manual lewat slider simulasi.
    # `overridden` menandai snapshot ini bukan hasil model, dan `pre_override`
    # menyimpan isi snapshot sebelum di-override supaya bisa dikembalikan utuh
    # saat mode demo dimatikan. Di operasi normal keduanya tidak pernah terisi.
    overridden = db.BooleanField(default=False)
    pre_override = db.DictField()
    # ----------------------------------------------------------------------

    computed_at = db.DateTimeField(default=datetime.datetime.utcnow)

    meta = {'indexes': ['asset']}

    def to_json(self):
        return {
            "asset_id": str(self.asset.id),
            "machine_id": self.machine_id,
            "asset_name": self.asset_name,
            "overall_health_score": self.overall_health_score,
            "health_score": self.health_score,
            "failure_probability": self.failure_probability,
            "predicted_days": self.predicted_days,
            "risk_level": self.risk_level,
            "priority": self.priority,
            "recommendation": self.recommendation,
            "due_date": self.due_date,
            "components": self.components,
            "computed_at": self.computed_at.isoformat() if self.computed_at else None,
        }
