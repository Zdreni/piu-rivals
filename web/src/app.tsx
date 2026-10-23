import type { ReactNode } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './pages/home_page.tsx';
import { PlayersPage } from './pages/admin/players_page.tsx';
import { RunPage } from './pages/admin/run_page.tsx';
import { RunsPage } from './pages/admin/runs_page.tsx';
import { UsersPage } from './pages/admin/users_page.tsx';
import { RivalsPage } from './pages/rivals/rivals_page.tsx';
import { SessionProvider, useSession } from './session.tsx';


// The brand on the left, opening the Rivals view once signed in; the admin menu in the middle; the account on the
// right, opening the home page.
function Header() {
  const { status, me } = useSession();
  const signedIn = status === 'signed-in'  &&  me;
  return (
    <header className="header">
      <div className="header-left">
        <NavLink to={signedIn ? '/rivals' : '/'} className="brand">PIU rivals</NavLink>
      </div>
      {signedIn  &&  (
        <>
          {me.user.isAdmin  &&  (
            <nav className="nav nav-admin" aria-label="Admin">
              <NavLink to="/admin/players">Players</NavLink>
              <NavLink to="/admin/runs">Scraping</NavLink>
              <NavLink to="/admin/users">Users</NavLink>
            </nav>
          )}
          <div className="account">
            <NavLink to="/" end className="muted" title={me.user.email}>{me.user.displayName  ||  me.user.email}</NavLink>
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


// The Rivals view fills the whole window below the menu bar; the other pages keep to a readable width, with the
// footer below them.
function Layout({ children }: { children: ReactNode }) {
  const full = useLocation().pathname === '/rivals';
  return (
    <div className={full ? 'app full' : 'app'}>
      <Header />
      <main className="main">{children}</main>
      {! full  &&  (
        <footer className="footer muted">
          <a href="privacy.html">Privacy policy</a>
          <span>Scores from <a href="https://piuscores.arroweclip.se">PIU Scores</a></span>
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
            <Route path="/admin/players" element={<AdminOnly><PlayersPage /></AdminOnly>} />
            <Route path="/admin/runs" element={<AdminOnly><RunsPage /></AdminOnly>} />
            <Route path="/admin/runs/:id" element={<AdminOnly><RunPage /></AdminOnly>} />
            <Route path="/admin/users" element={<AdminOnly><UsersPage /></AdminOnly>} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </Layout>
      </HashRouter>
    </SessionProvider>
  );
}
