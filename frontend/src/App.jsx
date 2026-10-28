import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import FindParkingPage from "./pages/FindParkingPage";
import LocationDetailPage from "./pages/LocationDetailPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import OwnerDashboard from "./pages/OwnerDashboard";
import OwnerLocationsPage from "./pages/OwnerLocationsPage";
import OwnerLoginPage from "./pages/OwnerLoginPage";
import OwnerReservationsPage from "./pages/OwnerReservationsPage";
import OwnerSlotsPage from "./pages/OwnerSlotsPage";
import ReceiptPage from "./pages/ReceiptPage";
import UserDashboard from "./pages/UserDashboard";
import UserLoginPage from "./pages/UserLoginPage";
import WelcomePage from "./pages/WelcomePage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/user/login" element={<UserLoginPage />} />
      <Route path="/owner/login" element={<OwnerLoginPage />} />

      {/* User area */}
      <Route element={<ProtectedRoute role="user" />}>
        {/* Standalone page so the receipt prints without navigation or footer */}
        <Route
          path="/user/bookings/:reservationId/receipt"
          element={<ReceiptPage />}
        />
        <Route element={<AppLayout />}>
          <Route path="/user/dashboard" element={<UserDashboard />} />
          <Route path="/user/find" element={<FindParkingPage />} />
          <Route path="/user/locations/:locationId" element={<LocationDetailPage />} />
          <Route path="/user/bookings" element={<MyBookingsPage />} />
        </Route>
      </Route>

      {/* Owner area */}
      <Route element={<ProtectedRoute role="owner" />}>
        <Route element={<AppLayout />}>
          <Route path="/owner/dashboard" element={<OwnerDashboard />} />
          <Route path="/owner/locations" element={<OwnerLocationsPage />} />
          <Route path="/owner/slots" element={<OwnerSlotsPage />} />
          <Route path="/owner/reservations" element={<OwnerReservationsPage />} />
        </Route>
      </Route>

      <Route path="/user" element={<Navigate to="/user/dashboard" replace />} />
      <Route path="/owner" element={<Navigate to="/owner/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
