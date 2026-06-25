import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { Layout } from './components/layout/Layout';

// Auth
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));

// App pages
const DashboardPage  = lazy(() => import('./pages/dashboard/DashboardPage'));
const ShipmentsPage  = lazy(() => import('./pages/shipments/ShipmentsPage'));
const ShipmentForm   = lazy(() => import('./pages/shipments/ShipmentForm'));
const ShipmentDetail = lazy(() => import('./pages/shipments/ShipmentDetail'));
const BookingsPage   = lazy(() => import('./pages/bookings/BookingsPage'));
const BookingForm    = lazy(() => import('./pages/bookings/BookingForm'));
const CustomersPage  = lazy(() => import('./pages/customers/CustomersPage'));
const CustomerForm   = lazy(() => import('./pages/customers/CustomerForm'));
const ForwardersPage = lazy(() => import('./pages/forwarders/ForwardersPage'));
const ForwarderForm  = lazy(() => import('./pages/forwarders/ForwarderForm'));
const PeriodsPage    = lazy(() => import('./pages/periods/PeriodsPage'));
const PeriodForm     = lazy(() => import('./pages/periods/PeriodForm'));
const FacilitiesPage = lazy(() => import('./pages/facilities/FacilitiesPage'));
const FacilityForm   = lazy(() => import('./pages/facilities/FacilityForm'));
const ShippingLinesPage = lazy(() => import('./pages/settings/ShippingLinesPage'));
const UsersPage      = lazy(() => import('./pages/users/UsersPage'));
const RolesPage      = lazy(() => import('./pages/roles/RolesPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
);

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="shipments"        element={<ShipmentsPage />} />
          <Route path="shipments/new"    element={<ShipmentForm />} />
          <Route path="shipments/:id"    element={<ShipmentDetail />} />
          <Route path="shipments/:id/edit" element={<ShipmentForm />} />

          <Route path="bookings"         element={<BookingsPage />} />
          <Route path="bookings/new"     element={<BookingForm />} />
          <Route path="bookings/:id/edit" element={<BookingForm />} />

          <Route path="customers"        element={<CustomersPage />} />
          <Route path="customers/new"    element={<CustomerForm />} />
          <Route path="customers/:id/edit" element={<CustomerForm />} />

          <Route path="forwarders"       element={<ForwardersPage />} />
          <Route path="forwarders/new"   element={<ForwarderForm />} />
          <Route path="forwarders/:id/edit" element={<ForwarderForm />} />

          <Route path="periods"          element={<PeriodsPage />} />
          <Route path="periods/new"      element={<PeriodForm />} />
          <Route path="periods/:id/edit" element={<PeriodForm />} />

          <Route path="facilities"       element={<FacilitiesPage />} />
          <Route path="facilities/new"   element={<FacilityForm />} />
          <Route path="facilities/:id/edit" element={<FacilityForm />} />

          <Route path="shipping-lines"   element={<ShippingLinesPage />} />
          <Route path="users"            element={<UsersPage />} />
          <Route path="roles"            element={<RolesPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
