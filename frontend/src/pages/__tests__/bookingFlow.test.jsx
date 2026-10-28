import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationDetailPage from "../LocationDetailPage";
import MyBookingsPage from "../MyBookingsPage";

const api = vi.hoisted(() => ({
  getLocation: vi.fn(),
  estimatePrice: vi.fn(),
  createReservation: vi.fn(),
  listMine: vi.fn(),
  cancelReservation: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  parkingApi: {
    getLocation: api.getLocation,
    estimatePrice: api.estimatePrice,
  },
  reservationApi: {
    create: api.createReservation,
    listMine: api.listMine,
    cancel: api.cancelReservation,
  },
}));

const LOCATION = {
  id: 1,
  owner_id: 9,
  name: "City Centre Parking",
  address: "12 MG Road",
  city: "Pune",
  area: "Camp",
  description: "Covered parking",
  opening_time: "08:00",
  closing_time: "22:00",
  hourly_rate: 40,
  latitude: null,
  longitude: null,
  is_active: true,
  is_open_now: true,
  availability: { total: 3, available: 2, occupied: 1, reserved: 0, out_of_service: 0 },
  slots: [
    {
      id: 11,
      location_id: 1,
      slot_number: "01",
      slot_type: "standard",
      status: "available",
      manual_status: "available",
      last_updated: "2026-01-01T10:00:00",
      reserved_until: null,
      is_bookable_for_window: true,
    },
    {
      id: 12,
      location_id: 1,
      slot_number: "02",
      slot_type: "standard",
      status: "occupied",
      manual_status: "occupied",
      last_updated: "2026-01-01T10:00:00",
      reserved_until: null,
      is_bookable_for_window: false,
    },
    {
      id: 13,
      location_id: 1,
      slot_number: "03",
      slot_type: "standard",
      status: "available",
      manual_status: "available",
      last_updated: "2026-01-01T10:00:00",
      reserved_until: null,
      is_bookable_for_window: true,
    },
  ],
};

function makeReservation(overrides = {}) {
  return {
    id: 5,
    booking_reference: "SP-AB12CD34",
    status: "active",
    start_time: "2030-01-02T09:00:00",
    end_time: "2030-01-02T11:00:00",
    hourly_rate_at_booking: 40,
    total_price: 80,
    created_at: "2030-01-01T10:00:00",
    cancelled_at: null,
    is_paid: false,
    slot: { id: 11, slot_number: "01", slot_type: "standard" },
    location: {
      id: 1,
      name: "City Centre Parking",
      address: "12 MG Road",
      city: "Pune",
      area: "Camp",
      opening_time: "08:00",
      closing_time: "22:00",
    },
    ...overrides,
  };
}

function renderPage(page, path, routePath) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={page} />
        <Route path="/user/bookings" element={<p>My bookings</p>} />
        <Route path="/user/find" element={<p>Find parking</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.getLocation.mockResolvedValue({ location: LOCATION, last_updated: "2026-01-01T10:00:00" });
  api.estimatePrice.mockResolvedValue({
    is_valid: true,
    estimated_total: 80,
    hours: 2,
    hourly_rate: 40,
    message: null,
  });
});

describe("booking flow", () => {
  it("books the selected slot and shows the real confirmation reference", async () => {
    const user = userEvent.setup();
    api.createReservation.mockResolvedValue({ reservation: makeReservation() });

    renderPage(<LocationDetailPage />, "/user/locations/1", "/user/locations/:locationId");

    const slot = await screen.findByRole("button", { name: /Slot 01/i });
    await user.click(slot);
    expect(slot).toHaveAttribute("aria-pressed", "true");

    await screen.findByText(/Estimated total/i);
    const startValue = screen.getByLabelText("Start").value;
    const endValue = screen.getByLabelText("End").value;
    expect(startValue).not.toBe("");
    expect(endValue).not.toBe("");

    const confirmButton = screen.getByRole("button", { name: /Confirm reservation/i });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1));
    expect(api.createReservation).toHaveBeenCalledWith({
      slot_id: 11,
      start_time: startValue,
      end_time: endValue,
    });

    expect(await screen.findByRole("heading", { name: "Reservation confirmed" })).toBeInTheDocument();
    expect(screen.getByText("SP-AB12CD34")).toBeInTheDocument();
    expect(screen.getByText(/no payment has been taken/i)).toBeInTheDocument();
  });

  it("prevents booking until an available slot is selected", async () => {
    renderPage(<LocationDetailPage />, "/user/locations/1", "/user/locations/:locationId");

    const occupied = await screen.findByRole("button", { name: /Slot 02/i });
    expect(occupied).toBeDisabled();

    const confirmButton = screen.getByRole("button", { name: /Confirm reservation/i });
    expect(confirmButton).toBeDisabled();

    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("shows the server message when a booking is rejected", async () => {
    const user = userEvent.setup();
    api.createReservation.mockRejectedValue(
      new Error("This slot is already reserved for part of that time. Please pick another slot or time.")
    );

    renderPage(<LocationDetailPage />, "/user/locations/1", "/user/locations/:locationId");

    await user.click(await screen.findByRole("button", { name: /Slot 01/i }));
    await screen.findByText(/Estimated total/i);
    await user.click(screen.getByRole("button", { name: /Confirm reservation/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already reserved/i);
    expect(screen.queryByRole("heading", { name: "Reservation confirmed" })).not.toBeInTheDocument();
  });
});

describe("cancellation flow", () => {
  it("cancels an active booking after confirmation and refreshes the list", async () => {
    const user = userEvent.setup();
    const cancelled = makeReservation({
      status: "cancelled",
      cancelled_at: "2030-01-01T12:30:00",
    });
    api.listMine
      .mockResolvedValueOnce({ reservations: [makeReservation()] })
      .mockResolvedValue({ reservations: [cancelled] });
    api.cancelReservation.mockResolvedValue({
      reservation: cancelled,
      message: "Reservation cancelled.",
    });

    renderPage(<MyBookingsPage />, "/user/bookings", "/user/bookings");

    const reference = await screen.findByText("SP-AB12CD34");
    const card = reference.closest(".booking-card");
    expect(card).not.toBeNull();

    await user.click(within(card).getByRole("button", { name: "Cancel booking" }));
    expect(within(card).getByText(/Cancel this reservation\?/i)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: /Yes, cancel booking/i }));

    await waitFor(() => expect(api.cancelReservation).toHaveBeenCalledWith(5));
    await waitFor(() => expect(within(card).getByText("Cancelled")).toBeInTheDocument());
    expect(within(card).queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /View \/ print receipt/i })).toHaveAttribute(
      "href",
      "/user/bookings/5/receipt"
    );
  });

  it("keeps the booking active and shows the error when cancellation fails", async () => {
    const user = userEvent.setup();
    api.listMine.mockResolvedValue({ reservations: [makeReservation()] });
    api.cancelReservation.mockRejectedValue(
      new Error("Completed reservations cannot be cancelled.")
    );

    renderPage(<MyBookingsPage />, "/user/bookings", "/user/bookings");

    const reference = await screen.findByText("SP-AB12CD34");
    const card = reference.closest(".booking-card");

    await user.click(within(card).getByRole("button", { name: "Cancel booking" }));
    await user.click(within(card).getByRole("button", { name: /Yes, cancel booking/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/cannot be cancelled/i);
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  it("does not offer cancellation for a completed booking", async () => {
    api.listMine.mockResolvedValue({
      reservations: [makeReservation({ status: "completed", end_time: "2020-01-02T11:00:00" })],
    });

    renderPage(<MyBookingsPage />, "/user/bookings", "/user/bookings");

    const reference = await screen.findByText("SP-AB12CD34");
    const card = reference.closest(".booking-card");

    expect(within(card).getByText("Completed")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });
});
