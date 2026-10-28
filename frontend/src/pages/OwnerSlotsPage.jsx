import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import SlotTile from "../components/SlotTile";
import StatusBadge from "../components/StatusBadge";
import { usePolling } from "../hooks/usePolling";
import { ownerApi } from "../services/api";
import { formatClock, formatDateTime } from "../utils/format";

const LEGEND = [
  { status: "available", text: "Available" },
  { status: "occupied", text: "Occupied" },
  { status: "reserved", text: "Reserved" },
  { status: "out_of_service", text: "Out of service" },
];

export default function OwnerSlotsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedLocationId = searchParams.get("location") || "";

  const { data: locationsData } = usePolling(
    async () => (await ownerApi.listLocations()).locations,
    []
  );
  const locations = locationsData ?? [];
  const selectedLocationId =
    requestedLocationId || (locations.length > 0 ? String(locations[0].id) : "");

  useEffect(() => {
    if (!requestedLocationId && locations.length > 0) {
      setSearchParams({ location: String(locations[0].id) }, { replace: true });
    }
  }, [requestedLocationId, locations, setSearchParams]);

  const { data, error, loading, lastUpdated, refresh } = usePolling(
    async () => (selectedLocationId ? ownerApi.listSlots(selectedLocationId) : null),
    [selectedLocationId]
  );

  const location = data?.location;
  const slots = data?.slots ?? [];

  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [slotForm, setSlotForm] = useState({ slot_number: "", slot_type: "", status: "available" });
  const [slotError, setSlotError] = useState("");
  const [slotSuccess, setSlotSuccess] = useState("");
  const [savingSlot, setSavingSlot] = useState(false);
  const [newSlot, setNewSlot] = useState({ slot_number: "", slot_type: "" });
  const [addError, setAddError] = useState("");
  const [addingSlot, setAddingSlot] = useState(false);

  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) || null;

  useEffect(() => {
    setSelectedSlotId(null);
    setSlotError("");
    setSlotSuccess("");
  }, [selectedLocationId]);

  useEffect(() => {
    if (!selectedSlotId) return;
    const slot = (data?.slots ?? []).find((item) => item.id === selectedSlotId);
    if (slot) {
      setSlotForm({
        slot_number: slot.slot_number,
        slot_type: slot.slot_type,
        status: slot.manual_status,
      });
    }
    // Only re-initialise when a different slot is selected, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId]);

  async function handleAddSlot(event) {
    event.preventDefault();
    setAddError("");
    setAddingSlot(true);
    try {
      await ownerApi.createSlot(selectedLocationId, {
        slot_number: newSlot.slot_number.trim(),
        slot_type: newSlot.slot_type.trim() || "standard",
      });
      setNewSlot({ slot_number: "", slot_type: "" });
      refresh();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleSaveSlot(event) {
    event.preventDefault();
    if (!selectedSlot) return;
    setSlotError("");
    setSlotSuccess("");
    setSavingSlot(true);
    try {
      await ownerApi.updateSlot(selectedSlot.id, slotForm);
      setSlotSuccess("Slot updated.");
      refresh();
    } catch (err) {
      setSlotError(err.message);
    } finally {
      setSavingSlot(false);
    }
  }

  async function handleSimulate(status) {
    if (!selectedSlot) return;
    setSlotError("");
    setSlotSuccess("");
    try {
      const result = await ownerApi.simulateSlot(selectedSlot.id, status);
      setSlotSuccess(result.message);
      setSlotForm((current) => ({ ...current, status }));
      refresh();
    } catch (err) {
      setSlotError(err.message);
    }
  }

  if (locationsData && locations.length === 0) {
    return (
      <EmptyState
        title="Add a parking location first"
        action={
          <Link className="btn btn--primary btn--sm" to="/owner/locations">
            Go to locations
          </Link>
        }
      >
        Slots belong to a parking location, so create one before managing bays.
      </EmptyState>
    );
  }

  if (loading && !data) {
    return <LoadingState message="Loading slots…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Slot management</h1>
          <p className="muted">
            Keep each bay up to date. Reservations are protected: a bay with a live booking cannot be
            changed manually.
          </p>
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <div className="panel filters">
        <div className="filters__row">
          <div className="field field--grow">
            <label htmlFor="slot-location">Parking location</label>
            <select
              id="slot-location"
              value={selectedLocationId}
              onChange={(event) => setSearchParams({ location: event.target.value })}
            >
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </div>
          {location ? (
            <div className="filters__meta small muted">
              {location.availability.total} slots · {location.availability.available} available ·{" "}
              {location.availability.reserved} reserved
            </div>
          ) : null}
        </div>
      </div>

      <div className="split split--wide">
        <section className="panel" aria-labelledby="slot-grid-heading">
          <div className="panel__head">
            <h2 id="slot-grid-heading">{location ? location.name : "Slots"}</h2>
            <span className="small muted">Select a slot to edit it</span>
          </div>

          <ul className="legend" aria-label="Slot status legend">
            {LEGEND.map((item) => (
              <li key={item.status}>
                <StatusBadge status={item.status} label={item.text} />
              </li>
            ))}
          </ul>

          {slots.length === 0 ? (
            <EmptyState title="No slots at this location">
              Use the form on the right to add your first bay.
            </EmptyState>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <SlotTile
                  key={slot.id}
                  slot={slot}
                  selected={slot.id === selectedSlotId}
                  onSelect={(chosen) => setSelectedSlotId(chosen.id)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="panel panel--sticky" aria-labelledby="add-slot-heading">
          <h2 id="add-slot-heading">Add a slot</h2>
          <Alert>{addError}</Alert>
          <form className="form" onSubmit={handleAddSlot}>
            <div className="field">
              <label htmlFor="new-slot-number">Slot number</label>
              <input
                id="new-slot-number"
                type="text"
                value={newSlot.slot_number}
                onChange={(event) => setNewSlot({ ...newSlot, slot_number: event.target.value })}
                placeholder="31 or EV-01"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-slot-type">Slot type (optional)</label>
              <input
                id="new-slot-type"
                type="text"
                value={newSlot.slot_type}
                onChange={(event) => setNewSlot({ ...newSlot, slot_type: event.target.value })}
                placeholder="standard, covered, EV"
              />
            </div>
            <button type="submit" className="btn btn--secondary btn--block" disabled={addingSlot}>
              {addingSlot ? "Adding…" : "Add slot"}
            </button>
          </form>

          <hr className="divider" />

          {selectedSlot ? (
            <>
              <div className="panel__head">
                <h2>Slot {selectedSlot.slot_number}</h2>
                <StatusBadge status={selectedSlot.status} />
              </div>
              <p className="small muted">
                Last status update: {formatDateTime(selectedSlot.last_updated)}
              </p>

              <Alert>{slotError}</Alert>
              <Alert tone="success">{slotSuccess}</Alert>

              <form className="form" onSubmit={handleSaveSlot}>
                <div className="field">
                  <label htmlFor="edit-slot-number">Slot number</label>
                  <input
                    id="edit-slot-number"
                    type="text"
                    value={slotForm.slot_number}
                    onChange={(event) =>
                      setSlotForm({ ...slotForm, slot_number: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-slot-type">Slot type</label>
                  <input
                    id="edit-slot-type"
                    type="text"
                    value={slotForm.slot_type}
                    onChange={(event) => setSlotForm({ ...slotForm, slot_type: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-slot-status">Status</label>
                  <select
                    id="edit-slot-status"
                    value={slotForm.status}
                    onChange={(event) => setSlotForm({ ...slotForm, status: event.target.value })}
                  >
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="out_of_service">Out of Service</option>
                  </select>
                  <p className="field__hint">
                    “Reserved” is set automatically by active bookings and cannot be typed here.
                  </p>
                </div>
                <button type="submit" className="btn btn--primary btn--block" disabled={savingSlot}>
                  {savingSlot ? "Saving…" : "Save slot"}
                </button>
              </form>

              <div className="simulation">
                <h3>Simulation mode</h3>
                <p className="small muted">
                  Demonstration control that stands in for a future sensor reading. It writes to the
                  database and is refused if the bay has an active reservation. It is not connected
                  to any hardware.
                </p>
                {selectedSlot.status === "reserved" ? (
                  <p className="small simulation__note">
                    This bay has an active reservation right now, so manual changes are blocked.
                  </p>
                ) : null}
                <div className="button-row">
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => handleSimulate("occupied")}
                  >
                    Simulate occupied
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => handleSimulate("available")}
                  >
                    Simulate available
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="muted">Select a slot from the grid to edit its details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
