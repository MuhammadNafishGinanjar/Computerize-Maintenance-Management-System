# /cmms-backend/app/__init__.py
from flask import Flask
from flask_mongoengine import MongoEngine
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from flask_socketio import SocketIO
from dotenv import load_dotenv
import os

# Baca cmms-backend/.env (di-gitignore, beda isi per environment) ke os.environ.
# Dilakukan di sini (bukan cuma di run.py) supaya tetap ke-load walau app
# dijalankan lewat entry point lain (mis. gunicorn yang import create_app langsung).
load_dotenv()

# Inisialisasi Database
db = MongoEngine()
bcrypt = Bcrypt()
socketio = SocketIO()

# Origin dev lokal yang selalu diizinkan (Vite dev server & CRA legacy).
_DEV_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]


def _get_cors_origins():
    """Dev selalu dapat localhost. Production tambahkan domainnya sendiri lewat
    CORS_EXTRA_ORIGINS di .env (comma-separated) — tidak perlu edit kode ini lagi
    tiap ganti/tambah domain."""
    extra = os.environ.get('CORS_EXTRA_ORIGINS', '')
    extra_origins = [o.strip() for o in extra.split(',') if o.strip()]
    return _DEV_ORIGINS + extra_origins


def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default_insecure_key_anda_harus_menggantinya')

    # --- KONFIGURASI KONEKSI MONGODB ---
    # Fallback value = setup default untuk dev lokal; production set lewat .env.
    db_username = os.environ.get('MONGO_USERNAME', 'vicki')
    db_password = os.environ.get('MONGO_PASSWORD', '123456')
    db_name = os.environ.get('MONGO_DB_NAME', 'cmms_db')
    db_host = os.environ.get('MONGO_HOST', 'localhost')
    auth_db = os.environ.get('MONGO_AUTH_DB', 'admin')

    # Gunakan MONGO_URI langsung jika tersedia (untuk Atlas / mongodb+srv://).
    # Fallback ke format URI lokal untuk dev environment.
    mongo_uri = os.environ.get('MONGO_URI') or \
        f'mongodb://{db_username}:{db_password}@{db_host}:27017/{db_name}?authSource={auth_db}'

    app.config['MONGODB_SETTINGS'] = {
        'db': db_name,
        'host': mongo_uri
    }

    # Inisialisasi DB dan Bcrypt dengan aplikasi Flask
    db.init_app(app)
    bcrypt.init_app(app)

    cors_origins = _get_cors_origins()

    # Izinkan CORS
    CORS(app, resources={r"/api/*": {"origins": cors_origins}})

    # Inisialisasi SocketIO untuk push real-time (notifikasi & status mesin)
    socketio.init_app(app, cors_allowed_origins=cors_origins)

    # Daftarkan blueprint (rute) Anda
    
    from .api.asset_routes import assets_bp
    app.register_blueprint(assets_bp, url_prefix='/api')
    
    from .api.wo_routes import wo_bp
    app.register_blueprint(wo_bp, url_prefix='/api')
    
    from .api.schedule_routes import schedule_bp
    app.register_blueprint(schedule_bp, url_prefix='/api')
    
    from .api.dashboard_routes import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    
    # --- PERBAIKAN FOKUS DI SINI ---
    from .api.compliance_routes import compliance_bp
    # Pastikan prefix adalah '/api/compliance' agar '/stats' menjadi /api/compliance/stats
    app.register_blueprint(compliance_bp, url_prefix='/api/compliance')
    # ------------------------------
    
    from .api.user_routes import user_bp
    app.register_blueprint(user_bp, url_prefix='/api')
    
    from .api.auth_routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    from .api.inventory_routes import inventory_bp
    app.register_blueprint(inventory_bp, url_prefix='/api/inventory')

    from .api.template_routes import template_bp
    app.register_blueprint(template_bp, url_prefix='/api')

    from .api.ml_routes import ml_bp
    app.register_blueprint(ml_bp, url_prefix='/api/ml')

    # Mode demo (override health score dari slider web simulasi). Sakelar
    # on/off-nya ada di web simulasi; set DEMO_MODE_ENABLED=0 untuk mematikan
    # dari sisi server. Lih. app/api/demo_routes.py.
    from .api.demo_routes import demo_bp
    app.register_blueprint(demo_bp, url_prefix='/api/demo')

    return app