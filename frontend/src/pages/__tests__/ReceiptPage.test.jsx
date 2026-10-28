import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReceiptPage from "../ReceiptPage";

const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../services/api", () => ({
  reservationApi: { get: api.get },
}));

const RESERVATION = {
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
};

function renderReceipt() {
  return render(
    <MemoryRouter initialEntries={["/user/bookings/5/receipt"]}>
      <Routes>
        <Route path="/user/bookings/:reservationId/receipt" element={<ReceiptPage />} />
        <Route path="/user/bookings" element={<p>My bookings</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  api.get.mockResolvedValue({ reservation: RESERVATION });
});

describe("receipt page", () => {
  it("renders the booking details and a QR code for the reference", async () => {
    renderReceipt();

    expect(
      await screen.findByRole("heading", { name: "City Centre Parking" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("SP-AB12CD34").length).toBeGreaterThan(0);
    expect(screen.getByText("01 (standard)")).toBeInTheDocument();
    expect(screen.getByText("2 hours")).toBeInTheDocument();
    expect(screen.getByText(/80\.00/)).toBeInTheDocument();
    expect(screen.getByText(/no payment has been taken/i)).toBeInTheDocument();

    // qrcode.react renders an SVG with a <title> child for accessibility.
    const qrTitle = screen.getByTitle("QR code for booking SP-AB12CD34");
    const qrCode = qrTitle.closest("svg");
    expect(qrCode).not.toBeNull();
    expect(qrCode).toHaveClass("receipt__qr-svg");
  });

  it("prints the receipt through the browser print dialog", async () => {
    const user = userEvent.setup();
    const printSpy = vi.fn();
    window.print = printSpy;

    renderReceipt();
    await screen.findByRole("heading", { name: "City Centre Parking" });

    await user.click(screen.getByRole("button", { name: /Print \/ Save as PDF/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the backend error when the receipt cannot be loaded", async () => {
    api.get.mockRejectedValue(new Error("Reservation not found."));

    renderReceipt();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Reservation not found.");
    expect(screen.getByRole("link", { name: /Back to my bookings/i })).toBeInTheDocument();
  });
});
