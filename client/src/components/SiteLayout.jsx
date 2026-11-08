import { Link, NavLink, Outlet } from 'react-router-dom';

const navLink = ({ isActive }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-moss-50 text-moss-800 font-semibold' : 'text-muted hover:text-ink hover:bg-moss-50/50'
  }`;

export default function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-moss-700 text-white text-xs font-serif font-bold shadow-xs transition-transform group-hover:scale-105">
              CA
            </span>
            <div className="leading-tight">
              <span className="block font-display text-lg font-bold text-moss-800">Company A Resort</span>
              <span className="block text-[11px] text-muted tracking-wider uppercase">Coffee Estate · Chikkamagaluru</span>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={navLink}>
              Rooms
            </NavLink>
            <NavLink to="/enquire" className={navLink}>
              Weddings and events
            </NavLink>
            <NavLink to="/booking" className={navLink}>
              Find my booking
            </NavLink>
            <Link
              to="/staff"
              className="ml-2 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-ink hover:border-moss-600 transition-colors"
            >
              Staff portal →
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Company A Resort, a coffee estate in Chikkamagaluru, Karnataka. Prices on this site include GST at the rate for the tariff.
          </p>
          <div className="flex gap-4 text-xs sm:text-sm">
            <Link to="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy notice
            </Link>
            <Link to="/staff" className="underline underline-offset-2 hover:text-ink">
              Staff sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
