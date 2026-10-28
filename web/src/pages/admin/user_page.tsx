import type { AdminPlayersResponse, AdminUser, AdminUserResponse } from '@piu-rivals/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../api.ts';
import { PlayerSelect } from '../../components/player_select.tsx';
import { useSession } from '../../session.tsx';
import { formatAgo, formatNumber, formatTime, playerLabel, useLoad } from '../../util.ts';
import { MAX_LEVEL, MAX_SCORE_CAP, parsePreferences } from '../../data/preferences.ts';


// The user's name, saved when the field loses focus or on Enter; Escape puts the saved name back. An empty name is
// filled from their Google account at their next sign-in.
function NameInput({ user, onSave }: { user: AdminUser; onSave: (displayName: string | null) => void }) {
  const [name, setName] = useState(user.displayName  ??  '');
  useEffect(()  =>  setName(user.displayName  ??  ''), [user.displayName]);

  const save = ()  => {
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
      onChange={(event)  =>  setName(event.target.value)}
      onBlur={save}
      onKeyDown={(event)  => {
        if (event.key === 'Enter')
          event.currentTarget.blur();
        else if (event.key === 'Escape')
          setName(user.displayName  ??  '');
      }}
    />
  );
}


// The Rivals view's settings as the user's pages read them: what's missing or invalid shows as its default. Levels
// that aren't set follow the user's scores, which only their own page works out.
function Settings({ data }: { data: AdminUserResponse }) {
  const { scoreCap, npMinimalRivals, countBy, minLevel, maxLevel } = parsePreferences(data.preferences);
  const auto = <span className="muted">auto</span>;
  return (
    <dl className="facts">
      <dt>Score cap</dt><dd>{scoreCap >= MAX_SCORE_CAP  ?  'No cap'  :  formatNumber(scoreCap)}</dd>
      <dt>Unplayed min rivals</dt><dd>{npMinimalRivals}</dd>
      <dt>Level range</dt>
      <dd>
        {(minLevel === null  &&  maxLevel === null)
          ?  auto
          :  <>{minLevel  ??  auto}..{maxLevel === null  ?  auto  :  maxLevel >= MAX_LEVEL  ?  `${MAX_LEVEL}+`  :  maxLevel}</>}
      </dd>
      <dt>Count by</dt><dd>{countBy}</dd>
      <dt>Snoozed charts</dt><dd>{data.snoozes}</dd>
    </dl>
  );
}


// One user: their account, changed only here, and their rivals and settings, to look at only.
export function UserPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me, reload: reloadSession } = useSession();
  const details = useLoad(()  =>  api<AdminUserResponse>('GET', `/admin/users/${id}`), [id]);
  const players = useLoad(()  =>  api<AdminPlayersResponse>('GET', '/admin/players'), []);
  const [error, setError] = useState<string | null>(null);
  const user = details.data?.user;
  const isMe = me?.user.id === user?.id;

  const update = async (changes: { displayName?: string | null; playerId?: string | null; isAdmin?: boolean })  => {
    try {
      await api('PATCH', `/admin/users/${id}`, changes);
      setError(null);
      if (isMe)
        await reloadSession();
    } catch (e) {
      setError(errorText(e));
    }
    await details.reload();
  };

  const remove = async ()  => {
    if (! user  ||  ! confirm(`Delete ${user.email}? They won't be able to sign in any more.`))
      return;

    try {
      await api('DELETE', `/admin/users/${id}`);
      navigate('/admin/users');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const back = <p><Link to="/admin/users">← Users</Link></p>;
  if (! details.data  ||  ! user) {
    return (
      <section>
        {back}
        {details.error  ?  <p className="error" role="alert">{details.error}</p>  :  <p className="muted">Loading…</p>}
      </section>
    );
  }

  const { rivals } = details.data;
  return (
    <section>
      {back}
      <div className="title-row">
        <h1>{user.displayName  ||  user.email}</h1>
        {! isMe  &&  (
          <div className="buttons">
            <button type="button" className="danger" onClick={()  =>  void remove()}>Delete</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="form-row">
          <label>
            Name
            <NameInput user={user} onSave={(displayName)  =>  void update({ displayName })} />
          </label>
          <label>
            Player
            <PlayerSelect
              players={players.data?.players  ??  []}
              value={user.player?.id  ??  null}
              onChange={(playerId)  =>  void update({ playerId })}
              label="Player"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={user.isAdmin}
              disabled={isMe}
              title={(isMe  ?  "You can't remove your own admin rights"  :  undefined)}
              onChange={(event)  =>  void update({ isAdmin: event.target.checked })}
            />
            Admin
          </label>
        </div>
        <dl className="facts small user-facts">
          <dt>Email</dt><dd>{user.email}</dd>
          <dt>Added</dt><dd>{formatTime(user.createdAt)}</dd>
          <dt>Last sign-in</dt><dd>{formatAgo(user.lastLoginAt)}</dd>
        </dl>
      </div>

      {(error  ??  players.error)  &&  <p className="error" role="alert">{error  ??  players.error}</p>}
      {! user.player  &&  <p className="muted">No player is linked, so they have no Rivals view.</p>}

      <h2>Rivals: {rivals.length}{user.rivalsOff  ?  ` (-${user.rivalsOff})`  :  ''}</h2>
      {rivals.length
        ?  (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Player</th><th className="number">PUMBILITY</th><th>Last scraped</th><th /></tr>
              </thead>
              <tbody>
                {rivals.map((rival)  =>  (
                  <tr key={rival.id} className={(rival.hidden  ?  'muted'  :  undefined)}>
                    <td>{playerLabel(rival)}</td>
                    <td className="number">{formatNumber(rival.pumbility)}</td>
                    <td>{formatAgo(rival.lastScrapedAt)}</td>
                    <td>{rival.hidden  &&  'Switched off'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        :  <p className="muted">No rivals.</p>}

      <h2>Settings</h2>
      <div className="card"><Settings data={details.data} /></div>
    </section>
  );
}
