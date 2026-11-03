import { Link, NavLink, Outlet } from 'react-router-dom';

const link = ({ isActive }) => `rounded px-2 py-1 text-[15px] ${isActive ? 'text-moss-700 font-semibold' : 'text-muted hover:text-ink'}`;

export default function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-xl font-semibold text-moss-800">Company A Resort</Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={link}>Rooms</NavLink>
            <NavLink to="/enquire" className={link}>Weddings and events</NavLink>
            <NavLink to="/booking" className={link}>Find my booking</NavLink>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Company A Resort, a coffee estate in Chikkamagaluru, Karnataka. Prices on this site include GST at the rate for the tariff.</p>
          <p className="flex gap-4">
            <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">Privacy notice</Link>
            <Link to="/staff" className="underline underline-offset-2 hover:text-ink">Staff sign-in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
