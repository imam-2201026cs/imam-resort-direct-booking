import { useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useTitle } from '../../lib/hooks.js';
import { Button, Field, Input, Notice, Spinner } from '../../components/ui.jsx';
import Inbox from './Inbox.jsx';
import Rates from './Rates.jsx';
import Bookings from './Bookings.jsx';

const DEMO = [
  { label: 'Reservations', email: 'reservations@resort.example' },
  { label: 'Sales', email: 'sales@resort.example' },
  { label: 'General Manager', email: 'gm@resort.example' },
];
const DEMO_PASSWORD = 'Resort#Demo2026'; // synthetic demo account, see deployment.md
const showDemo = import.meta.env.VITE_SHOW_DEMO_LOGINS !== 'false';

function Login() {
  useTitle('Staff sign-in');
  const { login } = useAuth();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(f.email, f.password); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Link to="/" className="font-display text-xl font-semibold text-moss-800">Company A Resort</Link>
      <h1 className="mt-6 text-3xl">Staff sign-in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" htmlFor="pw"><Input id="pw" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {err && <Notice tone="error">{err}</Notice>}
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      </form>
      {showDemo && (
        <div className="mt-8 rounded-lg border border-line bg-white p-4 text-sm">
          <p className="font-medium">Demo accounts for the reviewer</p>
          <p className="mt-1 text-muted">Synthetic users. Pick one to fill the form.</p>
          <div className="mt-3 flex flex-wrap gap-2">{DEMO.map((d) => <Button key={d.email} size="sm" variant="secondary" onClick={() => setF({ email: d.email, password: DEMO_PASSWORD })}>{d.label}</Button>)}</div>
        </div>
      )}
    </div>
  );
}

const nav = ({ isActive }) => `whitespace-nowrap rounded px-3 py-1.5 text-sm ${isActive ? 'bg-moss-600 text-white' : 'text-ink hover:bg-moss-100'}`;

function Shell() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-4">
            <span className="font-display text-lg font-semibold text-moss-800">Resort desk</span>
            <nav className="flex gap-1 overflow-x-auto" aria-label="Staff">
              <NavLink to="/staff/inbox" className={nav}>Enquiries</NavLink>
              <NavLink to="/staff/rates" className={nav}>Rates and allotment</NavLink>
              <NavLink to="/staff/bookings" className={nav}>Bookings</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{user.name}</span>
            <Link to="/" className="text-moss-700 underline underline-offset-2">View site</Link>
            <Button size="sm" variant="ghost" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="inbox" element={<Inbox />} />
          <Route path="rates" element={<Rates />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="*" element={<Navigate to="inbox" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function StaffApp() {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="flex justify-center py-24 text-moss-600"><Spinner className="h-7 w-7" /></div>;
  if (!user) return <Login />;
  if (loc.pathname === '/staff' || loc.pathname === '/staff/login') return <Navigate to="/staff/inbox" replace />;
  return <Shell />;
}
