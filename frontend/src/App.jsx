import { useEffect, useState } from "react";
const API = "http://127.0.0.1:5000/api";
export default function App() {
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  async function loadSlots() {
    try { const r = await fetch(API + "/slots"); if (!r.ok) throw new Error("Backend request failed"); setSlots(await r.json()); setError(""); }
    catch { setError("Cannot connect to backend. Start Flask on port 5000."); }
  }
  async function toggle(slot) {
    const status = slot.status === "available" ? "occupied" : "available";
    try { await fetch(API + "/slots/" + slot.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadSlots(); }
    catch { setError("Could not update slot."); }
  }
  useEffect(() => { loadSlots(); const id = setInterval(loadSlots, 5000); return () => clearInterval(id); }, []);
  const available = slots.filter(s => s.status === "available").length;
  return <main className="wrap"><header><div><p className="eyebrow">SMART PARKING · LIVE DEMO</p><h1>Find your parking spot.</h1><p className="muted">Real-time dashboard with simulated slot availability.</p></div><button className="refresh" onClick={loadSlots}>Refresh</button></header>
    <section className="stats"><article><span>Total slots</span><strong>{slots.length}</strong></article><article><span>Available</span><strong>{available}</strong></article><article><span>Occupied</span><strong>{slots.length - available}</strong></article></section>
    {error && <p className="error">{error}</p>}<section className="panel"><div className="panelhead"><h2>Parking slots</h2><span className="muted">Click a slot to simulate occupancy</span></div><div className="grid">{slots.map(slot => <button key={slot.id} onClick={() => toggle(slot)} className={"slot " + slot.status}><span className="car">▰</span><b>{slot.label}</b><small>{slot.status}</small></button>)}</div><p className="footnote">Prototype only: statuses are stored in a local SQLite database. No camera or physical sensor is connected.</p></section>
  </main>;
}
