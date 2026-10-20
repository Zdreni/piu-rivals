import type { ReactNode } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/home_page.tsx';
import { PlayersPage } from './pages/admin/players_page.tsx';
import { RunPage } from './pages/admin/run_page.tsx';
import { RunsPage } from './pages/admin/runs_page.tsx';
import { UsersPage } from './pages/admin/users_page.tsx';
import { SessionProvider, useSession } from './session.tsx';


function Header() {
  const { status, me, signOut } = useSession();
  return (
    <header className="header">
      <NavLink to="/" className="brand">piu-rivals</NavLink>
      {status === 'signed-in'  &&  me  &&  (
        <>
          {me.user.isAdmin  &&  (
            <nav className="nav" aria-label="Admin">
              <NavLink to="/admin/players">Players</NavLink>
              <NavLink to="/admin/runs">Scrape runs</NavLink>
              <NavLink to="/admin/users">Users</NavLink>
            </nav>
          )}
          <div className="account">
            <span className="muted" title={me.user.email}>{me.user.displayName  ||  me.user.email}</span>
            <button type="button" className="link-button" onClick={() => void signOut()}>Sign out</button>
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


export function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Header />
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin/players" element={<AdminOnly><PlayersPage /></AdminOnly>} />
            <Route path="/admin/runs" element={<AdminOnly><RunsPage /></AdminOnly>} />
            <Route path="/admin/runs/:id" element={<AdminOnly><RunPage /></AdminOnly>} />
            <Route path="/admin/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </main>
        <footer className="footer muted">
          <a href="privacy.html">Privacy policy</a>
          <span>Scores from <a href="https://piuscores.arroweclip.se">PIU Scores</a></span>
        </footer>
      </HashRouter>
    </SessionProvider>
  );
}
