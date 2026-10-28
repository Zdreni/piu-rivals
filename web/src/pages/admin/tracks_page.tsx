import type { AdminTrack, AdminTracksResponse } from '@piu-rivals/shared';
import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../../api.ts';
import { type Sort, SortHeader, textLength } from '../../components/sort_header.tsx';
import { useLoad } from '../../util.ts';

type SortColumn = 'id' | 'title' | 'length' | 'shortTitle';

const shortTitleLength = (track: AdminTrack)  =>  textLength(track.shortTitle);

const compare: Record<SortColumn, (a: AdminTrack, b: AdminTrack) => number> = {
  id: (a, b)  =>  a.id - b.id,
  title: (a, b)  =>  a.title.localeCompare(b.title),
  length: (a, b)  =>  shortTitleLength(a) - shortTitleLength(b),
  shortTitle: (a, b)  =>  a.shortTitle.localeCompare(b.shortTitle),
};


// The short name, saved when the field loses focus or on Enter; Escape puts the saved one back. An empty short name
// is the name again. A refused one stays in the field, so it can be fixed.
function ShortTitleInput({ track, onSave }: { track: AdminTrack; onSave: (shortTitle: string) => Promise<boolean> }) {
  const [value, setValue] = useState(track.shortTitle);
  useEffect(()  =>  setValue(track.shortTitle), [track.shortTitle]);

  const save = async ()  => {
    const trimmedTitle = value.trim();
    if (trimmedTitle === track.shortTitle)
      return;

    if (await onSave(trimmedTitle)  &&  ! trimmedTitle)
      setValue(track.title);
  };

  return (
    <input
      type="text"
      maxLength={255}
      value={value}
      placeholder={track.title}
      aria-label={`Short name of ${track.title}`}
      onChange={(event)  =>  setValue(event.target.value)}
      onBlur={()  =>  void save()}
      onKeyDown={(event)  => {
        if (event.key === 'Enter')
          event.currentTarget.blur();
        else if (event.key === 'Escape')
          setValue(track.shortTitle);
      }}
    />
  );
}


export function TracksPage() {
  const tracks = useLoad(()  =>  api<AdminTracksResponse>('GET', '/admin/tracks'), []);
  const [allTracks, setAllTracks] = useState<AdminTrack[]>([]);
  const [sort, setSort] = useState<Sort<SortColumn>>({ column: 'title', descending: false });
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(()  =>  setAllTracks(tracks.data?.tracks  ??  []), [tracks.data]);

  const shownTracks = useMemo(()  => {
    const words = filter.trim().toLowerCase();
    const matchingTracks = (words
      ?  allTracks.filter((t)  =>  t.title.toLowerCase().includes(words)  ||  t.shortTitle.toLowerCase().includes(words))
      :  allTracks);

    const sign = (sort.descending  ?  -1  :  1);
    // Ties go by name.
    return [...matchingTracks].sort((a, b)  =>  sign * compare[sort.column](a, b)  ||  compare.title(a, b));
  }, [allTracks, sort, filter]);

  const saveShortTitle = async (track: AdminTrack, shortTitle: string)  => {
    try {
      const { track: saved } = await api<{ track: AdminTrack }>('PATCH', `/admin/tracks/${track.id}`, { shortTitle });
      setAllTracks((old)  =>  old.map((t)  =>  (t.id === saved.id  ?  saved  :  t)));
      setError(null);
      return true;
    } catch (e) {
      setError(`${track.title}: ${errorText(e)}`);
      return false;
    }
  };

  const sortProps = { sort, onSort: setSort };
  return (
    <section>
      <h1>Tracks</h1>
      <p className="muted">
        Songs with scraped scores. The short name is shown where the name doesn't fit; it can't be another track's name
        or short name. Leave it empty to use the name again.
      </p>

      <div className="title-row">
        <input
          type="search"
          value={filter}
          placeholder="Filter"
          aria-label="Filter tracks"
          onChange={(event)  =>  setFilter(event.target.value)}
        />
        <span className="muted">
          {filter.trim()  ?  `${shownTracks.length} of ${allTracks.length}`  :  allTracks.length} track{allTracks.length === 1  ?  ''  :  's'}
        </span>
      </div>

      {(error  ??  tracks.error)  &&  <p className="error" role="alert">{error  ??  tracks.error}</p>}

      <div className="table-wrap">
        <table className="tracks-table">
          <colgroup><col className="tracks-id" /><col /><col /><col className="tracks-length" /></colgroup>
          <thead>
            <tr>
              <SortHeader column="id" label="ID" className="number" {...sortProps} />
              <SortHeader column="title" label="Name" {...sortProps} />
              <SortHeader column="shortTitle" label="Short name" {...sortProps} />
              <SortHeader column="length" label="Length" className="number" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {shownTracks.map((track)  =>  (
              <tr key={track.id}>
                <td className="number muted">{track.id}</td>
                <td title={track.songKey}>{track.title}</td>
                <td><ShortTitleInput track={track} onSave={(shortTitle)  =>  saveShortTitle(track, shortTitle)} /></td>
                <td className="number">{shortTitleLength(track)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {! tracks.data  &&  ! tracks.error  &&  <p className="muted">Loading…</p>}
      {tracks.data  &&  ! allTracks.length  &&  <p className="muted">No tracks yet: they come with scraped scores.</p>}
    </section>
  );
}
