import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import StatusBadge from "../components/StatusBadge";
import { usePolling } from "../hooks/usePolling";
import { ownerApi } from "../services/api";
import { formatClock, formatCurrency } from "../utils/format";

const EMPTY_FORM = {
  name: "",
  address: "",
  city: "",
  area: "",
  description: "",
  opening_time: "08:00",
  closing_time: "22:00",
  hourly_rate: "",
  total_slots: "10",
  latitude: "",
  longitude: "",
};

export default function OwnerLocationsPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const { data, error, loading, lastUpdated, refresh } = usePolling(
    async () => (await ownerApi.listLocations()).locations,
    []
  );
  const locations = data ?? [];

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFieldErrors({});
    setFormError("");
    setFormSuccess("");
    setFormOpen(true);
  }

  function openEditForm(location) {
    setForm({
      name: location.name,
      address: location.address,
      city: location.city,
      area: location.area,
      description: location.description || "",
      opening_time: location.opening_time,
      closing_time: location.closing_time,
      hourly_rate: String(location.hourly_rate),
      total_slots: String(location.availability.total),
      latitude: location.latitude ?? "",
      longitude: location.longitude ?? "",
    });
    setEditingId(location.id);
    setFieldErrors({});
    setFormError("");
    setFormSuccess("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
  }

  function validate() {
    const errors = {};
    if (!form.name.trim()) errors.name = "Enter a parking name.";
    if (!form.address.trim()) errors.address = "Enter an address.";
    if (!form.city.trim()) errors.city = "Enter a city.";
    if (!form.area.trim()) errors.area = "Enter an area or locality.";
    if (form.hourly_rate === "" || Number(form.hourly_rate) < 0) {
      errors.hourly_rate = "Enter an hourly rate of 0 or more.";
    }
    if (!editingId && Number(form.total_slots) <= 0) {
      errors.total_slots = "Create at least one slot.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");
    if (!validate()) return;

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      area: form.area.trim(),
      description: form.description.trim(),
      opening_time: form.opening_time,
      closing_time: form.closing_time,
      hourly_rate: form.hourly_rate,
      latitude: form.latitude,
      longitude: form.longitude,
    };

    setSaving(true);
    try {
      if (editingId) {
        await ownerApi.updateLocation(editingId, payload);
        setFormSuccess("Parking location updated.");
      } else {
        await ownerApi.createLocation({
          ...payload,
          total_slots: form.total_slots,
        });
        setFormSuccess("Parking location created with its slots.");
      }
      refresh();
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err.message);
      setFieldErrors(err.details || {});
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(location) {
    setActionError("");
    setBusyId(location.id);
    try {
      await ownerApi.updateLocation(location.id, { is_active: !location.is_active });
      refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(locationId) {
    setActionError("");
    setBusyId(locationId);
    try {
      await ownerApi.deleteLocation(locationId);
      setConfirmDeleteId(null);
      refresh();
    } catch (err) {
      setActionError(err.message);
      setConfirmDeleteId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) {
    return <LoadingState message="Loading your parking locations…" />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>My parking locations</h1>
          <p className="muted">Add, edit and activate the car parks that belong to you.</p>
        </div>
        <div className="page-head__actions">
          <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
          <button type="button" className="btn btn--primary" onClick={openCreateForm}>
            + Add location
          </button>
        </div>
      </div>

      <Alert>{actionError}</Alert>
      <Alert tone="success">{formSuccess}</Alert>

      {formOpen ? (
        <section className="panel" aria-labelledby="location-form-heading">
          <div className="panel__head">
            <h2 id="location-form-heading">
              {editingId ? "Edit parking location" : "New parking location"}
            </h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={closeForm}>
              Close
            </button>
          </div>

          <Alert>{formError}</Alert>

          <form className="form form-grid" onSubmit={handleSubmit} noValidate>
            <div className="field field--wide">
              <label htmlFor="location-name">Parking name</label>
              <input
                id="location-name"
                name="name"
                type="text"
                value={form.name}
                onChange={updateField}
                placeholder="City Centre Parking"
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}
            </div>

            <div className="field field--wide">
              <label htmlFor="location-address">Address</label>
              <input
                id="location-address"
                name="address"
                type="text"
                value={form.address}
                onChange={updateField}
                placeholder="12 MG Road, near metro station"
                aria-invalid={Boolean(fieldErrors.address)}
              />
              {fieldErrors.address ? <p className="field__error">{fieldErrors.address}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="location-city">City</label>
              <input
                id="location-city"
                name="city"
                type="text"
                value={form.city}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.city)}
              />
              {fieldErrors.city ? <p className="field__error">{fieldErrors.city}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="location-area">Area / locality</label>
              <input
                id="location-area"
                name="area"
                type="text"
                value={form.area}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.area)}
              />
              {fieldErrors.area ? <p className="field__error">{fieldErrors.area}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="location-opening">Opening time</label>
              <input
                id="location-opening"
                name="opening_time"
                type="time"
                value={form.opening_time}
                onChange={updateField}
              />
            </div>

            <div className="field">
              <label htmlFor="location-closing">Closing time</label>
              <input
                id="location-closing"
                name="closing_time"
                type="time"
                value={form.closing_time}
                onChange={updateField}
              />
            </div>

            <div className="field">
              <label htmlFor="location-rate">Hourly rate (₹)</label>
              <input
                id="location-rate"
                name="hourly_rate"
                type="number"
                min="0"
                step="0.5"
                value={form.hourly_rate}
                onChange={updateField}
                aria-invalid={Boolean(fieldErrors.hourly_rate)}
              />
              {fieldErrors.hourly_rate ? (
                <p className="field__error">{fieldErrors.hourly_rate}</p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="location-slots">Total parking slots</label>
              <input
                id="location-slots"
                name="total_slots"
                type="number"
                min="1"
                max="300"
                value={form.total_slots}
                onChange={updateField}
                disabled={Boolean(editingId)}
                aria-invalid={Boolean(fieldErrors.total_slots)}
              />
              <p className="field__hint">
                {editingId
                  ? "Slots are managed on the Slots page."
                  : "Slots numbered 01, 02, … are created automatically."}
              </p>
              {fieldErrors.total_slots ? (
                <p className="field__error">{fieldErrors.total_slots}</p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="location-latitude">Latitude (optional)</label>
              <input
                id="location-latitude"
                name="latitude"
                type="number"
                step="0.000001"
                value={form.latitude}
                onChange={updateField}
                placeholder="For future map integration"
              />
            </div>

            <div className="field">
              <label htmlFor="location-longitude">Longitude (optional)</label>
              <input
                id="location-longitude"
                name="longitude"
                type="number"
                step="0.000001"
                value={form.longitude}
                onChange={updateField}
              />
            </div>

            <div className="field field--wide">
              <label htmlFor="location-description">Short description</label>
              <textarea
                id="location-description"
                name="description"
                rows="3"
                value={form.description}
                onChange={updateField}
                placeholder="Covered parking, 24x7 security, near the metro exit."
              />
            </div>

            <div className="button-row field--wide">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create location"}
              </button>
              <button type="button" className="btn btn--ghost" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {locations.length === 0 ? (
        <EmptyState
          title="No parking locations yet"
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={openCreateForm}>
              Add your first location
            </button>
          }
        >
          Create a location with a name, address, hours and hourly rate.
        </EmptyState>
      ) : (
        <ul className="location-admin-list">
          {locations.map((location) => (
            <li key={location.id} className="panel location-admin">
              <div className="location-admin__head">
                <div>
                  <h2 className="location-admin__title">
                    {location.name}{" "}
                    <StatusBadge
                      status={location.is_active ? "active" : "inactive"}
                      label={location.is_active ? "Active" : "Inactive"}
                    />
                  </h2>
                  <p className="small muted">
                    {location.address}, {location.area}, {location.city}
                  </p>
                </div>
                <p className="price">
                  {formatCurrency(location.hourly_rate)}
                  <span className="price__unit">/hour</span>
                </p>
              </div>

              <dl className="meta-grid">
                <div>
                  <dt>Opening hours</dt>
                  <dd>
                    {location.opening_time} – {location.closing_time}
                  </dd>
                </div>
                <div>
                  <dt>Slots</dt>
                  <dd>{location.availability.total}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd>{location.availability.available}</dd>
                </div>
                <div>
                  <dt>Reserved</dt>
                  <dd>{location.availability.reserved}</dd>
                </div>
              </dl>

              <div className="button-row">
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => openEditForm(location)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={() => navigate(`/owner/slots?location=${location.id}`)}
                >
                  Manage slots
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => toggleActive(location)}
                  disabled={busyId === location.id}
                >
                  {location.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm"
                  onClick={() => setConfirmDeleteId(location.id)}
                >
                  Delete
                </button>
              </div>

              {confirmDeleteId === location.id ? (
                <div className="confirm-bar">
                  <p className="small">
                    Delete “{location.name}”? Locations with booking history cannot be deleted —
                    deactivate them instead.
                  </p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => handleDelete(location.id)}
                      disabled={busyId === location.id}
                    >
                      {busyId === location.id ? "Deleting…" : "Yes, delete location"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
