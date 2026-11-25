// The Setup tabs' box to find a player by name; Escape clears it.
export function PlayerSearch({ query, placeholder, onQuery }: {
  query: string;
  placeholder: string;
  onQuery: (query: string) => void;
}) {
  return (
    <div className="player-search">
      <input
        type="search"
        placeholder={placeholder}
        aria-label="Find a player by name"
        value={query}
        onChange={(event)  =>  onQuery(event.target.value)}
        onKeyDown={(event)  =>  event.key === 'Escape'  &&  onQuery('')}
      />
    </div>
  );
}


// Whether `name` holds the trimmed, lowercased `searchText`; any name does when it's empty.
export const isFound = (name: string, searchText: string)  =>  ! searchText  ||  name.toLowerCase().includes(searchText);
