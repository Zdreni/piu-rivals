// A bar above the view while scores are loading, or with an error in red; nothing otherwise.
export function StatusBar({ status }: { status: { text: string; error: boolean } | null }) {
  if (! status)
    return null;

  return (
    <div className="status-bar">
      <span className={`status-text${(status.error  ?  ' error'  :  '')}`} role={(status.error  ?  'alert'  :  undefined)}>{status.text}</span>
    </div>
  );
}
