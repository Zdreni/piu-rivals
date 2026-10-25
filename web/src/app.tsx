import type { ReactNode } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/home_page.tsx';
import { PlayersPage } from './pages/admin/players_page.tsx';
import { RunPage } from './pages/admin/run_page.tsx';
import { RunsPage } from './pages/admin/runs_page.tsx';
import { TracksPage } from './pages/admin/tracks_page.tsx';
import { UsersPage } from './pages/admin/users_page.tsx';
import { HistoryPage } from './pages/rivals/history_page.tsx';
import { RivalsPage } from './pages/rivals/rivals_page.tsx';
import { SessionProvider, useSession } from './session.tsx';


// Outline icons in the text's colour, before the menu bar's links.
const icon = (children: ReactNode) => <svg className="nav-icon" viewBox="0 0 16 16" aria-hidden="true">{children}</svg>;
// Two people: you and your rivals.
const RIVALS_ICON = icon(<>
  <circle cx="5.5" cy="5.5" r="2.5" /><path d="M1 14c0-2.5 2-4.3 4.5-4.3S10 11.5 10 14" />
  <circle cx="11" cy="4.5" r="2" /><path d="M11.5 8.6c2 .2 3.5 1.9 3.5 4" />
</>);
// A line going up: your scores rising.
const HISTORY_ICON = icon(<path d="M1.5 12.5l4-4 3 3 6-6M10.5 5.5h4v4" />);
// A head and shoulders: your account.
const ACCOUNT_ICON = icon(<><circle cx="8" cy="5.5" r="3" /><path d="M2.5 14.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /></>);


// The user's pages on the left: Rivals (the home page until signed in), then History; the admin menu in the middle;
// the account on the right, opening the home page.
function Header() {
  const { status, me } = useSession();
  const signedIn = status === 'signed-in'  &&  me;
  return (
    <header className="header">
      <div className="header-left">
        <nav className="nav nav-main" aria-label="Pages">
          <NavLink to={signedIn ? '/rivals' : '/'} end>{RIVALS_ICON}Rivals</NavLink>
          {signedIn  &&  me.user.player  &&  <NavLink to="/history">{HISTORY_ICON}History</NavLink>}
        </nav>
      </div>
      {signedIn  &&  (
        <>
          {me.user.isAdmin  &&  (
            <nav className="nav nav-admin" aria-label="Admin">
              <NavLink to="/admin/players">Players</NavLink>
              <NavLink to="/admin/tracks">Tracks</NavLink>
              <NavLink to="/admin/runs">Scraping</NavLink>
              <NavLink to="/admin/users">Users</NavLink>
            </nav>
          )}
          <div className="account">
            <NavLink to="/" end className="muted" title={me.user.email}>
              {ACCOUNT_ICON}
              <span className="account-name">{me.user.displayName  ||  me.user.email}</span>
            </NavLink>
          </div>
        </>
      )}
    </header>
  );
}


// Admin pages show only for signed-in admins.
function AdminOnly({ children }: { children: ReactNode }) {
  const { status, me } = useSession();
  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (! me?.user.isAdmin)
    return <p>This page is for admins.</p>;

  return children;
}


// The Rivals view and the History page fill the whole window below the menu bar; the other pages keep to a
// readable width, with the footer below them.
const FULL_PAGES = ['/rivals', '/history'];

function Layout({ children }: { children: ReactNode }) {
  const full = FULL_PAGES.includes(useLocation().pathname);
  return (
    <div className={full ? 'app full' : 'app'}>
      <Header />
      <main className="main">{children}</main>
      {! full  &&  (
        <footer className="footer muted">
          <a href="privacy.html">Privacy policy</a>
        </footer>
      )}
    </div>
  );
}


export function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/rivals" element={<RivalsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/admin/players" element={<AdminOnly><PlayersPage /></AdminOnly>} />
            <Route path="/admin/runs" element={<AdminOnly><RunsPage /></AdminOnly>} />
            <Route path="/admin/runs/:id" element={<AdminOnly><RunPage /></AdminOnly>} />
            <Route path="/admin/tracks" element={<AdminOnly><TracksPage /></AdminOnly>} />
            <Route path="/admin/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </Layout>
      </HashRouter>
    </SessionProvider>
  );
}
