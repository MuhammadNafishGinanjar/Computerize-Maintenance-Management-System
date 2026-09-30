from app import create_app
from app.models import User, ComponentItem, AssetTemplate, Asset, WorkOrder, MaintenanceSchedule, ComplianceLog
import datetime

app = create_app()


def safe_save(model, defaults, **filters):
    obj = model.objects(**filters).first()
    if obj:
        return obj
    return model(**{**filters, **defaults}).save()


def create_dummy_data():
    with app.app_context():
        # Users
        admin = User.objects(email='admin@cmms.com').first()
        if not admin:
            admin = User(name='Admin Utama', email='admin@cmms.com', role='admin')
        admin.set_password('password123')
        admin.save()

        manager = User.objects(email='manager@cmms.com').first()
        if not manager:
            manager = User(name='Manager Operasional', email='manager@cmms.com', role='manager')
        manager.set_password('password123')
        manager.save()

        technician = User.objects(email='tech@cmms.com').first()
        if not technician:
            technician = User(name='Teknisi Lapangan', email='tech@cmms.com', role='technician')
        technician.set_password('password123')
        technician.save()

        # Inventory components — disesuaikan dengan 7 mesin: Induksi, Forging, Robot, Motor AC, Compressor, Bor, Bubut
        components_data = [
            {'name': 'Kumparan Induksi',        'part_number': 'IC-1001', 'stock_quantity': 2,  'location': 'Gudang Utama', 'low_stock_threshold': 3},
            {'name': 'Capacitor Bank',           'part_number': 'CB-2050', 'stock_quantity': 4,  'location': 'Gudang Utama'},
            {'name': 'Pompa Air Pendingin',      'part_number': 'CWP-3010', 'stock_quantity': 5, 'location': 'Gudang Cabang'},
            {'name': 'Die Set Forging',          'part_number': 'FD-4400', 'stock_quantity': 3,  'location': 'Gudang Utama'},
            {'name': 'Hydraulic Cylinder',       'part_number': 'HC-5500', 'stock_quantity': 4,  'location': 'Gudang Utama'},
            {'name': 'Guide Bushing',            'part_number': 'GB-6600', 'stock_quantity': 10, 'location': 'Gudang Cabang', 'low_stock_threshold': 8},
            {'name': 'Servo Motor',              'part_number': 'SVM-7700', 'stock_quantity': 3, 'location': 'Gudang Sisi'},
            {'name': 'Encoder Module',           'part_number': 'ENC-8800', 'stock_quantity': 6, 'location': 'Gudang Sisi'},
            {'name': 'Robot Gripper',            'part_number': 'GRP-9900', 'stock_quantity': 4, 'location': 'Gudang Sisi'},
            {'name': 'Winding Motor AC',         'part_number': 'AMW-1100', 'stock_quantity': 2, 'location': 'Gudang Utama'},
            {'name': 'Bearing Motor',            'part_number': 'MB-1200', 'stock_quantity': 8,  'location': 'Gudang Utama'},
            {'name': 'Fan Blade Pendingin',      'part_number': 'CFB-1300', 'stock_quantity': 12, 'location': 'Gudang Cabang'},
            {'name': 'Air Filter Compressor',    'part_number': 'CAF-1400', 'stock_quantity': 6, 'location': 'Gudang Utama'},
            {'name': 'Bearing Set Compressor',   'part_number': 'CBS-1500', 'stock_quantity': 5, 'location': 'Gudang Utama'},
            {'name': 'Spindle Mesin Bor',        'part_number': 'DSP-1600', 'stock_quantity': 3, 'location': 'Gudang Utama'},
            {'name': 'Bearing Spindle Bor',      'part_number': 'DBS-1700', 'stock_quantity': 6, 'location': 'Gudang Utama'},
            {'name': 'Mata Bor HSS',             'part_number': 'DRB-1800', 'stock_quantity': 15, 'location': 'Gudang Cabang', 'low_stock_threshold': 10},
            {'name': 'Spindle Mesin Bubut',      'part_number': 'LSP-1900', 'stock_quantity': 2, 'location': 'Gudang Utama'},
            {'name': 'Chuck Rahang Tiga',        'part_number': 'LCK-2000', 'stock_quantity': 4, 'location': 'Gudang Utama'},
            {'name': 'Pahat Bubut HSS',          'part_number': 'LTB-2100', 'stock_quantity': 14, 'location': 'Gudang Cabang', 'low_stock_threshold': 10},
        ]
        components = []
        for item in components_data:
            comp = safe_save(ComponentItem, {
                'part_number': item['part_number'],
                'stock_quantity': item['stock_quantity'],
                'location': item['location'],
                'low_stock_threshold': item.get('low_stock_threshold', 5)
            }, name=item['name'])
            components.append(comp)

        # Index komponen untuk kemudahan referensi
        (kumparan_induksi, capacitor_bank, pompa_air, die_set, hydraulic_cylinder,
         guide_bushing, servo_motor, encoder_module, robot_gripper,
         winding_motor, bearing_motor, fan_blade, air_filter_comp, bearing_comp,
         spindle_bor, bearing_spindle_bor, mata_bor,
         spindle_bubut, chuck_bubut, pahat_bubut) = components

        # Asset templates
        induksi_template = safe_save(AssetTemplate, {
            'components': [kumparan_induksi, capacitor_bank, pompa_air]
        }, name='Mesin Induksi')

        forging_template = safe_save(AssetTemplate, {
            'components': [die_set, hydraulic_cylinder, guide_bushing]
        }, name='Mesin Forging')

        robot_template = safe_save(AssetTemplate, {
            'components': [servo_motor, encoder_module, robot_gripper]
        }, name='Robot Industri')

        motor_ac_template = safe_save(AssetTemplate, {
            'components': [winding_motor, bearing_motor, fan_blade]
        }, name='Motor AC')

        compressor_template = safe_save(AssetTemplate, {
            'components': [air_filter_comp, bearing_comp, pompa_air]
        }, name='Compressor')

        bor_template = safe_save(AssetTemplate, {
            'components': [spindle_bor, bearing_spindle_bor, mata_bor]
        }, name='Mesin Bor')

        bubut_template = safe_save(AssetTemplate, {
            'components': [spindle_bubut, chuck_bubut, pahat_bubut]
        }, name='Mesin Bubut')

        # Assets — 6 mesin utama + 1 compressor
        induksi_asset = safe_save(Asset, {
            'machine_id': 'IND-001',
            'location': 'Line Peleburan A',
            'status': 'running',
            'components': [kumparan_induksi, capacitor_bank, pompa_air]
        }, name='Mesin Induksi I1')

        forging_asset = safe_save(Asset, {
            'machine_id': 'FRG-002',
            'location': 'Line Tempa B',
            'status': 'down',
            'components': [die_set, hydraulic_cylinder, guide_bushing]
        }, name='Mesin Forging F2')

        robot_asset = safe_save(Asset, {
            'machine_id': 'ROB-003',
            'location': 'Line Perakitan C',
            'status': 'running',
            'components': [servo_motor, encoder_module, robot_gripper]
        }, name='Robot Welding R3')

        motor_ac_asset = safe_save(Asset, {
            'machine_id': 'MTR-004',
            'location': 'Ruang Utilitas D',
            'status': 'running',
            'components': [winding_motor, bearing_motor, fan_blade]
        }, name='Motor AC Blower M4')

        # machine_id DRL-001 dipakai oleh ml_registry.py (BorPredictor) — jangan diubah
        bor_asset = safe_save(Asset, {
            'machine_id': 'DRL-001',
            'location': 'Line Permesinan F',
            'status': 'running',
            'components': [spindle_bor, bearing_spindle_bor, mata_bor]
        }, name='Mesin Bor D1')

        # machine_id BBT-001 dipakai oleh ml_registry.py (MACHINES) — jangan diubah
        bubut_asset = safe_save(Asset, {
            'machine_id': 'BBT-001',
            'location': 'Line Permesinan F',
            'status': 'running',
            'components': [spindle_bubut, chuck_bubut, pahat_bubut]
        }, name='Mesin Bubut B1')

        # machine_id CMP-DUMMY-001 dipakai oleh ml_registry.py (CompressorPredictor) — jangan diubah
        compressor_asset = safe_save(Asset, {
            'machine_id': 'CMP-DUMMY-001',
            'location': 'Ruang Kompresor E',
            'status': 'running',
            'components': [air_filter_comp, bearing_comp, pompa_air]
        }, name='Compressor Bearing C5')

        # Work orders
        now = datetime.datetime.utcnow()
        work_orders_data = [
            {
                'title': 'Perbaikan isolasi kumparan induksi retak',
                'description': (
                    'Isolasi pada kumparan induksi menunjukkan tanda keretakan akibat panas '
                    'berlebih saat proses peleburan. Dilakukan penggantian lapisan isolasi dan '
                    'pengujian tahanan isolasi (megger test) hingga kembali sesuai standar.'
                ),
                'status': 'open',
                'priority': 'high',
                'type': 'repair',
                'component': kumparan_induksi,
                'asset': induksi_asset,
                'assigned_to': technician,
                'created_by_role': 'manager',
                'created_at': now - datetime.timedelta(days=1),
                'due_date': now + datetime.timedelta(days=2),
            },
            {
                'title': 'Penggantian encoder robot akibat drift posisi',
                'description': (
                    'Robot welding R3 menunjukkan drift posisi pada sumbu 4 sebesar 0,8mm, '
                    'menyebabkan hasil las tidak presisi. Encoder module diduga aus dan perlu diganti.'
                ),
                'status': 'in_progress',
                'priority': 'medium',
                'type': 'repair',
                'component': encoder_module,
                'asset': robot_asset,
                'assigned_to': technician,
                'created_by_role': 'manager',
                'created_at': now - datetime.timedelta(days=3),
                'due_date': now + datetime.timedelta(days=1),
            },
            {
                'title': 'Verifikasi perbaikan hydraulic cylinder forging',
                'description': (
                    'Periksa hasil penggantian seal hydraulic cylinder pada mesin forging F2 '
                    'setelah ditemukan kebocoran oli saat proses penempaan.'
                ),
                'status': 'pending_verification',
                'priority': 'high',
                'type': 'inspection',
                'component': hydraulic_cylinder,
                'asset': forging_asset,
                'assigned_to': technician,
                'created_by_role': 'admin',
                'created_at': now - datetime.timedelta(days=5),
                'due_date': now - datetime.timedelta(days=1),
                'completed_at': now - datetime.timedelta(days=1),
            },
            {
                'title': 'Pengecekan preventif bearing motor AC',
                'description': (
                    'Pemeriksaan rutin bearing motor AC blower M4 untuk mencegah keausan dini '
                    'dan memastikan getaran motor tetap dalam batas normal.'
                ),
                'status': 'completed',
                'priority': 'low',
                'type': 'preventive',
                'component': bearing_motor,
                'asset': motor_ac_asset,
                'assigned_to': technician,
                'created_by_role': 'admin',
                'created_at': now - datetime.timedelta(days=10),
                'due_date': now - datetime.timedelta(days=2),
                'completed_at': now - datetime.timedelta(days=2),
            },
        ]
        work_orders = []
        for item in work_orders_data:
            wo = WorkOrder.objects(title=item['title']).first()
            if not wo:
                wo = WorkOrder(
                    title=item['title'],
                    description=item['description'],
                    status=item['status'],
                    priority=item['priority'],
                    type=item['type'],
                    component=item['component'],
                    asset=item['asset'],
                    assigned_to=item['assigned_to'],
                    created_by_role=item['created_by_role'],
                    created_at=item['created_at'],
                    due_date=item['due_date'],
                    completed_at=item.get('completed_at'),
                ).save()
            work_orders.append(wo)

        # Assign maintenance history ke masing-masing asset
        for asset in (induksi_asset, forging_asset, robot_asset, motor_ac_asset, compressor_asset):
            asset.maintenance_history = [wo for wo in work_orders if wo.asset == asset]
            asset.save()

        # Maintenance schedules
        schedule_data = [
            {
                'asset': induksi_asset,
                'task_name': 'Megger test isolasi kumparan induksi',
                'frequency': 'monthly',
                'frequency_days': 30,
                'next_due_date': now + datetime.timedelta(days=3),
                'description_template': 'Uji tahanan isolasi kumparan dan periksa capacitor bank.',
                'component': 'Kumparan Induksi'
            },
            {
                'asset': forging_asset,
                'task_name': 'Inspeksi keausan die set forging',
                'frequency': 'bi-weekly',
                'frequency_days': 14,
                'next_due_date': now + datetime.timedelta(days=6),
                'description_template': 'Periksa keretakan dan keausan permukaan die set.',
                'component': 'Die Set Forging'
            },
            {
                'asset': robot_asset,
                'task_name': 'Kalibrasi ulang TCP robot',
                'frequency': 'weekly',
                'frequency_days': 7,
                'next_due_date': now + datetime.timedelta(days=2),
                'description_template': 'Kalibrasi Tool Center Point dan periksa akurasi servo motor.',
                'component': 'Servo Motor'
            },
            {
                'asset': motor_ac_asset,
                'task_name': 'Pengukuran getaran & suhu motor AC',
                'frequency': 'weekly',
                'frequency_days': 7,
                'next_due_date': now + datetime.timedelta(days=4),
                'description_template': 'Ukur getaran bearing dan suhu winding motor AC.',
                'component': 'Bearing Motor'
            },
            {
                'asset': compressor_asset,
                'task_name': 'Pemeriksaan bearing & filter compressor',
                'frequency': 'weekly',
                'frequency_days': 7,
                'next_due_date': now + datetime.timedelta(days=5),
                'description_template': 'Periksa kondisi bearing, air filter, dan aliran air pendingin.',
                'component': 'Bearing Set Compressor'
            },
        ]
        for item in schedule_data:
            MaintenanceSchedule.objects(task_name=item['task_name'], asset=item['asset']).first() or MaintenanceSchedule(
                asset=item['asset'],
                task_name=item['task_name'],
                frequency=item['frequency'],
                frequency_days=item['frequency_days'],
                next_due_date=item['next_due_date'],
                description_template=item['description_template'],
                component=item['component']
            ).save()

        # Compliance logs
        compliance_data = [
            {
                'asset': induksi_asset,
                'regulation_name': 'ISO 9001 Audit',
                'status': 'pending',
                'next_check_due': now + datetime.timedelta(days=5),
                'evidence_document_url': 'https://example.com/evidence/iso9001-induksi'
            },
            {
                'asset': forging_asset,
                'regulation_name': 'Inspection K3',
                'status': 'compliant',
                'next_check_due': now + datetime.timedelta(days=12),
                'evidence_document_url': 'https://example.com/evidence/k3-forging'
            },
            {
                'asset': robot_asset,
                'regulation_name': 'Sertifikasi Keselamatan Robot',
                'status': 'pending',
                'next_check_due': now + datetime.timedelta(days=8),
                'evidence_document_url': 'https://example.com/evidence/safety-robot'
            },
            {
                'asset': motor_ac_asset,
                'regulation_name': 'Pemeriksaan Kelistrikan',
                'status': 'pending',
                'next_check_due': now + datetime.timedelta(days=9),
                'evidence_document_url': 'https://example.com/evidence/listrik-motor-ac'
            },
            {
                'asset': compressor_asset,
                'regulation_name': 'Pemeriksaan Lingkungan',
                'status': 'compliant',
                'next_check_due': now + datetime.timedelta(days=14),
                'evidence_document_url': 'https://example.com/evidence/env-compressor'
            },
        ]
        for item in compliance_data:
            ComplianceLog.objects(regulation_name=item['regulation_name'], asset=item['asset']).first() or ComplianceLog(
                asset=item['asset'],
                regulation_name=item['regulation_name'],
                status=item['status'],
                next_check_due=item['next_check_due'],
                evidence_document_url=item['evidence_document_url']
            ).save()

        print('Seed dummy data selesai. Database sekarang berisi 5 aset (Mesin Induksi, Mesin Forging, '
              'Robot, Motor AC, Compressor), komponen, template, WO, jadwal, compliance, dan users.')


if __name__ == '__main__':
    create_dummy_data()
