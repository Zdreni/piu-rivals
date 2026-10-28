export interface Sort<Column extends string> {
  column: Column;
  descending: boolean;
}


// Counted in characters, not UTF-16 units.
export const textLength = (text: string | null)  =>  [...(text  ??  '')].length;


// A sortable column's header: clicking it sorts by the column, and again reverses the order.
export function SortHeader<Column extends string>({ column, label, sort, onSort, className }: {
  column: Column;
  label: string;
  sort: Sort<Column>;
  onSort: (sort: Sort<Column>) => void;
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <th className={className} aria-sort={(active  ?  (sort.descending  ?  'descending'  :  'ascending')  :  'none')}>
      <button
        type="button"
        className="sort-button"
        onClick={()  =>  onSort({ column, descending: (active  ?  ! sort.descending  :  false) })}
      >
        {label}<span className="sort-mark">{active  ?  (sort.descending  ?  '▼'  :  '▲')  :  ''}</span>
      </button>
    </th>
  );
}
