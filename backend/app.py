from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from pathlib import Path

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + str(Path(__file__).with_name("smartparking.db"))
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
CORS(app)
db = SQLAlchemy(app)

class Slot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(20), unique=True, nullable=False)
    status = db.Column(db.String(20), default="available", nullable=False)

with app.app_context():
    db.create_all()
    if Slot.query.count() == 0:
        db.session.add_all([Slot(label=f"A{i:02d}") for i in range(1, 13)])
        db.session.commit()

@app.get("/api/health")
def health():
    return jsonify(status="ok", mode="simulation")

@app.get("/api/slots")
def get_slots():
    return jsonify([{"id": s.id, "label": s.label, "status": s.status} for s in Slot.query.order_by(Slot.id).all()])

@app.patch("/api/slots/<int:slot_id>")
def update_slot(slot_id):
    slot = db.session.get(Slot, slot_id)
    if not slot:
        return jsonify(error="Slot not found"), 404
    data = __import__("flask").request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("available", "occupied"):
        return jsonify(error="Status must be available or occupied"), 400
    slot.status = status
    db.session.commit()
    return jsonify(id=slot.id, label=slot.label, status=slot.status)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
