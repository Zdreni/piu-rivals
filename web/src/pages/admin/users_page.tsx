import type { AdminPlayersResponse, AdminUser, AdminUsersResponse } from '@piu-rivals/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { PlayerSelect } from '../../components/player_select.tsx';
import { useSession } from '../../session.tsx';
import { formatAgo, useLoad } from '../../util.ts';


// The user's name, saved when the field loses focus or on Enter; Escape puts the saved name back. An empty name is
// filled from their Google account at their next sign-in.
function NameInput({ user, onSave }: { user: AdminUser; onSave: (displayName: string | null) => void }) {
  const [name, setName] = useState(user.displayName  ??  '');
  useEffect(() => setName(user.displayName  ??  ''), [user.displayName]);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed !== (user.displayName  ??  ''))
      onSave(trimmed  ||  null);
  };

  return (
    <input
      type="text"
      maxLength={100}
      value={name}
      placeholder="From Google"
      aria-label={`Name of ${user.email}`}
      onChange={(event) => setName(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter')
          event.currentTarget.blur();
        else if (event.key === 'Escape')
          setName(user.displayName  ??  '');
      }}
    />
  );
}


function UserRow({ user, players, onChange }: {
  user: AdminUser;
  players: AdminPlayersResponse['players'];
  onChange: (error: string | null) => void;
}) {
  const { me, reload: reloadSession } = useSession();
  const isMe = me?.user.id === user.id;

  const update = async (changes: { displayName?: string | null; playerId?: string | null; isAdmin?: boolean }) => {
    try {
      await api('PATCH', `/admin/users/${user.id}`, changes);
      onChange(null);
      if (isMe)
        await reloadSession();
    } catch (e) {
      onChange(errorText(e));
    }
  };

  const remove = async () => {
    if (! confirm(`Delete ${user.email}? They won't be able to sign in any more.`))
      return;

    try {
      await api('DELETE', `/admin/users/${user.id}`);
      onChange(null);
    } catch (e) {
      onChange(errorText(e));
    }
  };

  return (
    <tr>
      <td>{user.email}</td>
      <td><NameInput user={user} onSave={(displayName) => void update({ displayName })} /></td>
      <td>
        <PlayerSelect
          players={players}
          value={user.player?.id  ??  null}
          onChange={(playerId) => void update({ playerId })}
          label={`Player of ${user.email}`}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={user.isAdmin}
          disabled={isMe}
          title={isMe ? "You can't remove your own admin rights" : undefined}
          onChange={(event) => void update({ isAdmin: event.target.checked })}
          aria-label={`${user.email} is admin`}
        />
      </td>
      <td className="muted">{formatAgo(user.lastLoginAt)}</td>
      <td>
        {! isMe  &&  <button type="button" className="danger small-button" onClick={() => void remove()}>Delete</button>}
      </td>
    </tr>
  );
}


export function UsersPage() {
  const users = useLoad(() => api<AdminUsersResponse>('GET', '/admin/users'), []);
  const players = useLoad(() => api<AdminPlayersResponse>('GET', '/admin/players'), []);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (event: FormEvent) => {
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

  const onRowChange = (rowError: string | null) => {
    setError(rowError);
    void users.reload();
  };

  const playerList = players.data?.players  ??  [];
  return (
    <section>
      <h1>Users</h1>
      <p className="muted">
        Only these Google accounts can sign in. Link a user to their PIU Scores player to give them the Rivals view;
        a player belongs to one user at most.
      </p>

      <form className="card form-row" onSubmit={(event) => void add(event)}>
        <label>
          Google email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" />
        </label>
        <label>
          Name
          <input type="text" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="From Google" />
        </label>
        <label>
          Player
          <PlayerSelect players={playerList} value={playerId} onChange={setPlayerId} label="Player" />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
          Admin
        </label>
        <button type="submit">Add user</button>
      </form>

      {(error  ??  users.error  ??  players.error)  &&  <p className="error" role="alert">{error  ??  users.error  ??  players.error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Email</th><th>Name</th><th>Player</th><th>Admin</th><th>Last sign-in</th><th /></tr>
          </thead>
          <tbody>
            {users.data?.users.map((user) => <UserRow key={user.id} user={user} players={playerList} onChange={onRowChange} />)}
          </tbody>
        </table>
      </div>
      {! users.data  &&  ! users.error  &&  <p className="muted">Loading…</p>}
    </section>
  );
}
