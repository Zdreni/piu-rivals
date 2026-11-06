// A toast at the bottom of the screen while scores are loading, or with an error in red; nothing
//  otherwise. It floats over the view, so the layout doesn't move when it shows up.
export function StatusToast({ status }: { status: { text: string; error: boolean } | null }) {
  if (! status)
    return null;

  return (
    <div className={`status-toast${(status.error  ?  ' error'  :  '')}`} role={(status.error  ?  'alert'  :  'status')}>
      {status.text}
    </div>
  );
}
