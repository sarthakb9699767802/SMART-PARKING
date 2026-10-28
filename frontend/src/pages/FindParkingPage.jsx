import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import LocationCard from "../components/LocationCard";
import { usePolling } from "../hooks/usePolling";
import { parkingApi } from "../services/api";
import { formatClock } from "../utils/format";

export default function FindParkingPage() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") || "";

  const [draft, setDraft] = useState({
    search: initialSearch,
    maxPrice: "",
    availableOnly: false,
  });
  const [applied, setApplied] = useState({
    search: initialSearch,
    maxPrice: "",
    availableOnly: false,
  });

  const { data, error, loading, lastUpdated, refresh } = usePolling(
    () =>
      parkingApi.listLocations({
        search: applied.search,
        max_price: applied.maxPrice,
        available_only: applied.availableOnly ? "true" : "",
      }),
    [applied.search, applied.maxPrice, applied.availableOnly]
  );

  const locations = data?.locations ?? [];
  const filtersActive = Boolean(applied.search || applied.maxPrice || applied.availableOnly);

  function applyFilters(event) {
    event.preventDefault();
    setApplied({ ...draft, search: draft.search.trim() });
  }

  function resetFilters() {
    const cleared = { search: "", maxPrice: "", availableOnly: false };
    setDraft(cleared);
    setApplied(cleared);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Find parking</p>
          <h1>Search available parking</h1>
          <p className="muted">
            Filter by name, city, area or price. Availability refreshes automatically every 5
            seconds.
          </p>
        </div>
        <p className="updated small muted">Updated {formatClock(lastUpdated)}</p>
      </div>

      <form className="panel filters" onSubmit={applyFilters} aria-label="Parking filters">
        <div className="filters__row">
          <div className="field field--grow">
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="search"
              placeholder="City, area, address or parking name"
              value={draft.search}
              onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="max-price">Max price (₹/hour)</label>
            <input
              id="max-price"
              type="number"
              min="0"
              step="10"
              placeholder="Any price"
              value={draft.maxPrice}
              onChange={(event) => setDraft({ ...draft, maxPrice: event.target.value })}
            />
          </div>

          <div className="field field--checkbox">
            <label htmlFor="available-only">
              <input
                id="available-only"
                type="checkbox"
                checked={draft.availableOnly}
                onChange={(event) =>
                  setDraft({ ...draft, availableOnly: event.target.checked })
                }
              />
              Only locations with free slots
            </label>
          </div>

          <div className="filters__actions">
            <button type="submit" className="btn btn--primary">
              Apply filters
            </button>
            <button type="button" className="btn btn--ghost" onClick={resetFilters}>
              Reset
            </button>
          </div>
        </div>
      </form>

      {loading && !data ? <LoadingState message="Searching parking locations…" /> : null}

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}

      {!loading && !error ? (
        <>
          <p className="result-count small">
            <strong>{locations.length}</strong> parking{" "}
            {locations.length === 1 ? "location" : "locations"}
            {applied.search ? ` for “${applied.search}”` : ""}
          </p>

          {locations.length === 0 ? (
            <EmptyState
              title="No parking matched your filters"
              action={
                filtersActive ? (
                  <button type="button" className="btn btn--secondary btn--sm" onClick={resetFilters}>
                    Clear filters
                  </button>
                ) : (
                  <LinkToFindAnother />
                )
              }
            >
              Try a different area, a higher maximum price, or turn off the free-slots filter.
            </EmptyState>
          ) : (
            <div className="card-grid">
              {locations.map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function LinkToFindAnother() {
  return (
    <p className="small muted">
      No parking locations are active yet. A parking owner has to add one first.
    </p>
  );
}
