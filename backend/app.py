"""SmartPark Flask application factory.

Run locally with:
    python app.py            (from the backend folder)

The SQLite file lives in backend/data/smartpark.db and is created if missing.
It is never wiped automatically, so user data survives restarts.
"""

import os

from flask import Flask, jsonify
from sqlalchemy import text
from werkzeug.exceptions import HTTPException

from extensions import cors, db
from routes.auth import auth_bp
from routes.locations import locations_bp
from routes.owner import owner_bp
from routes.reservations import reservations_bp
from utils import ApiError, iso, now, success

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEFAULT_DATABASE = os.path.join(DATA_DIR, "smartpark.db")
FRONTEND_ORIGIN = "http://localhost:5173"


def _sqlite_uri(path):
    # SQLAlchemy wants forward slashes, and Windows paths keep their drive letter.
    return "sqlite:///" + path.replace("\\", "/")


def create_app(overrides=None):
    app = Flask(__name__)
    os.makedirs(DATA_DIR, exist_ok=True)

    app.config.update(
        SQLALCHEMY_DATABASE_URI=_sqlite_uri(
            os.environ.get("SMARTPARK_DATABASE", DEFAULT_DATABASE)
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_TTL_HOURS=24,
        JSON_SORT_KEYS=False,
        PROPAGATE_EXCEPTIONS=False,
    )
    if overrides:
        app.config.update(overrides)

    db.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", FRONTEND_ORIGIN)}},
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(locations_bp)
    app.register_blueprint(reservations_bp)
    app.register_blueprint(owner_bp)

    @app.get("/api/health")
    def health():
        db.session.execute(text("SELECT 1"))
        return success({
            "status": "ok",
            "service": "SmartPark API",
            "time": iso(now()),
        })

    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return jsonify({
            "ok": False,
            "error": error.message,
            "details": error.details,
        }), error.status_code

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify({
            "ok": False,
            "error": error.description,
            "details": {},
        }), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        db.session.rollback()
        app.logger.exception("Unhandled error")
        if app.config.get("TESTING"):
            raise error
        return jsonify({
            "ok": False,
            "error": "Something went wrong on the server. Please try again.",
            "details": {},
        }), 500

    with app.app_context():
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
