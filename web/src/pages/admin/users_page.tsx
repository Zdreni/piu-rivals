import type { AdminPlayersResponse, AdminUser, AdminUsersResponse } from '@piu-rivals/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { PlayerSelect } from '../../components/player_select.tsx';
import { formatAgo, useLoad } from '../../util.ts';


// One user, to look at only: everything is changed on their page, opened by their name. Admins' names stand out.
function UserRow({ user }: { user: AdminUser }) {
  return (
    <tr>
      <td>
        <Link to={`/admin/users/${user.id}`} className={(user.isAdmin  ?  'admin-name'  :  undefined)} title={(user.isAdmin  ?  'Admin'  :  undefined)}>
          {user.displayName  ||  user.email}
        </Link>
      </td>
      <td className="muted">{formatAgo(user.lastSeenAt)}</td>
      {/* Users without a player have no Rivals view, so no rivals either. */}
      <td className="number">{user.player  &&  (user.rivalsOff  ?  `${user.rivals} (-${user.rivalsOff})`  :  user.rivals)}</td>
    </tr>
  );
}


export function UsersPage() {
  const users = useLoad(()  =>  api<AdminUsersResponse>('GET', '/admin/users'), []);
  const players = useLoad(()  =>  api<AdminPlayersResponse>('GET', '/admin/players'), []);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (event: FormEvent)  => {
    event.preventDefault();
    try {
      await api('POST', '/admin/users', { email, displayName: displayName.trim()  ||  null, playerId, isAdmin });
      setEmail('');
      setDisplayName('');
      setPlayerId(null);
      setIsAdmin(false);
      setError(null);
      await users.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const playerList = players.data?.players  ??  [];
  return (
    <section>
      <h1>Users</h1>
      <p className="muted">
        Only these Google accounts can sign in. Link a user to their PIU Scores player to give them the Rivals view;
        a player belongs to one user at most.
      </p>

      <form className="card form-row" onSubmit={(event)  =>  void add(event)}>
        <label>
          Google email
          <input type="email" required value={email} onChange={(event)  =>  setEmail(event.target.value)} placeholder="name@gmail.com" />
        </label>
        <label>
          Name
          <input type="text" maxLength={100} value={displayName} onChange={(event)  =>  setDisplayName(event.target.value)} placeholder="From Google" />
        </label>
        <label>
          Player
          <PlayerSelect players={playerList} value={playerId} onChange={setPlayerId} label="Player" />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={isAdmin} onChange={(event)  =>  setIsAdmin(event.target.checked)} />
          Admin
        </label>
        <button type="submit">Add user</button>
      </form>

      {(error  ??  users.error  ??  players.error)  &&  <p className="error" role="alert">{error  ??  users.error  ??  players.error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Last seen</th><th className="number">Rivals</th></tr>
          </thead>
          <tbody>
            {users.data?.users.map((user)  =>  <UserRow key={user.id} user={user} />)}
          </tbody>
        </table>
      </div>
      {! users.data  &&  ! users.error  &&  <p className="muted">Loading…</p>}
    </section>
  );
}
