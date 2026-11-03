import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import SiteLayout from './components/SiteLayout.jsx';
import { Spinner } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import RoomDetail from './pages/RoomDetail.jsx';
import Booking from './pages/Booking.jsx';
import Confirmation from './pages/Confirmation.jsx';
import Enquire from './pages/Enquire.jsx';
import Privacy from './pages/Privacy.jsx';

// Staff screens are split out so guests on slow networks never download them.
const Staff = lazy(() => import('./pages/staff/StaffApp.jsx'));

const Loading = () => <div className="flex justify-center py-24 text-moss-600"><Spinner className="h-7 w-7" /></div>;

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="rooms/:slug" element={<RoomDetail />} />
            <Route path="book" element={<Booking />} />
            <Route path="booking" element={<Confirmation />} />
            <Route path="booking/:reference" element={<Confirmation />} />
            <Route path="enquire" element={<Enquire />} />
            <Route path="privacy" element={<Privacy />} />
          </Route>
          <Route path="staff/*" element={<Staff />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
