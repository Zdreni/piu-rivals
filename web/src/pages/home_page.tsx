import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleButton } from '../components/google_button.tsx';
import { useSession } from '../session.tsx';
import { formatNumber, playerLabel } from '../util.ts';


export function HomePage() {
  const { status, me } = useSession();
  const navigate = useNavigate();
  const wasSignedOut = useRef(status === 'signed-out');

  // Signing in here goes on to the Rivals view, for players who have one.
  useEffect(() => {
    if (status === 'signed-out')
      wasSignedOut.current = true;
    else if (status === 'signed-in'  &&  wasSignedOut.current  &&  me?.user.player)
      navigate('/rivals', { replace: true });
  }, [status, me, navigate]);

  if (status === 'loading')
    return <p className="muted">Loading…</p>;

  if (status === 'signed-out'  ||  ! me) {
    return (
      <section className="intro">
        <h1>piu-rivals</h1>
        <p>Compare your Pump It Up Phoenix 2 scores with your rivals', using public data from PIU Scores.</p>
        <p className="muted">piu-rivals is open to invited players. Sign in with the Google account an admin added.</p>
        <GoogleButton />
      </section>
    );
  }

  const { user, rivals } = me;
  return (
    <section>
      <h1>Hi, {user.displayName  ||  user.email}</h1>
      {user.player
        ? (
          <p>
            Your player: <strong>{playerLabel(user.player)}</strong>, PUMBILITY {formatNumber(user.player.pumbility)}.
            {' '}{rivals.length} rival{rivals.length === 1 ? '' : 's'}.
          </p>
        )
        : <p className="muted">No PIU Scores player is linked to your account yet, so there's no Rivals view for you.</p>}
      {user.player  &&  <p><Link to="/rivals">Compare your scores with your rivals'</Link>.</p>}
      {user.isAdmin  &&  (
        <p>
          Admin: manage <Link to="/admin/players">players</Link>, <Link to="/admin/runs">scrape runs</Link>
          {' '}and <Link to="/admin/users">users</Link>.
        </p>
      )}
    </section>
  );
}
