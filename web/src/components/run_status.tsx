import type { ScrapeRun } from '@piu-rivals/shared';

const KIND_LABELS: Record<ScrapeRun['kind'], string> = {
  all: 'All players',
  selected: 'Selected players',
  register: 'Register players',
  rescan: 'Rescan players',
};

export const runKindLabel = (run: ScrapeRun)  =>  KIND_LABELS[run.kind];

export const isActive = (run: ScrapeRun)  =>  run.status === 'queued'  ||  run.status === 'running';


export function RunStatus({ run }: { run: ScrapeRun }) {
  const label = ((run.status === 'running'  &&  run.cancelRequested)  ?  'cancelling'  :  run.status);
  return <span className={`status status-${run.status}`}>{label}</span>;
}


export function RunProgress({ run }: { run: ScrapeRun }) {
  const share = (run.playersTotal  ?  run.playersDone / run.playersTotal  :  0);
  return (
    <div className="progress" title={`${run.playersDone} of ${run.playersTotal} players`}>
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={run.playersTotal} aria-valuenow={run.playersDone}>
        <div className="progress-fill" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <span className="muted small">{run.playersDone} / {run.playersTotal}</span>
    </div>
  );
}
