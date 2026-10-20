import { StatWords } from './format.tsx';
import {
  clampNpMinimalRivals, clampScoreCap, type CountBy, MAX_NP_RIVALS, MAX_SCORE_CAP, MIN_NP_RIVALS, MIN_SCORE_CAP,
  type Preferences, SCORE_CAP_STEP,
} from './preferences.ts';
import { type Counts, STAT_WORDS } from './stats.ts';


// A label above a − value + row.
function Stepper({ className, label, text, title, off, canLower, canRaise, lowerLabel, raiseLabel, onStep }: {
  className: string;
  label: string;
  text: string;
  title: string;
  off: boolean;
  canLower: boolean;
  canRaise: boolean;
  lowerLabel: string;
  raiseLabel: string;
  onStep: (step: number) => void;
}) {
  return (
    <div className={`stepper ${className}${off ? ' off' : ''}`} title={title}>
      <span className="stepper-label">{label}</span>
      <button type="button" aria-label={lowerLabel} disabled={! canLower} onClick={() => onStep(-1)}>−</button>
      <span className="stepper-value">{text}</span>
      <button type="button" aria-label={raiseLabel} disabled={! canRaise} onClick={() => onStep(1)}>+</button>
    </div>
  );
}


const COUNT_BY_BUTTONS: { value: CountBy; label: string; title: string }[] = [
  { value: 'results', label: 'Results', title: "Count each rival's result separately" },
  { value: 'charts', label: 'Charts', title: 'Count each chart once: inferior if any rival beats you, otherwise not played or superior' },
];


// The title, named by what is counted, with your totals, and the score cap, np minimal rivals and count by settings.
// `status` is a short note on loading scores, if any.
export function WindowHeader({ totals, preferences, status, onChange }: {
  totals: Counts;
  preferences: Preferences;
  status: { text: string; error: boolean } | null;
  onChange: (changes: Partial<Preferences>) => void;
}) {
  const { scoreCap, npMinimalRivals, countBy } = preferences;
  return (
    <div className="dlg-head">
      <h2>
        {countBy === 'charts' ? 'Rival charts' : 'Rival results'}
        <span className="head-stats"> — <StatWords counts={totals} words={STAT_WORDS[countBy]} /></span>
      </h2>
      {status  &&  <span className={`head-status${status.error ? ' error' : ''}`} role={status.error ? 'alert' : undefined}>{status.text}</span>}
      <div className="head-settings">
        <Stepper
          className="score-cap"
          label="Score cap"
          text={`${scoreCap / 1000}k`}
          title={scoreCap >= MAX_SCORE_CAP ? 'No score cap is applied' : `Hide losses or wins on mutual scores ≥ ${scoreCap / 1000}k`}
          off={scoreCap >= MAX_SCORE_CAP}
          canLower={scoreCap > MIN_SCORE_CAP}
          canRaise={scoreCap < MAX_SCORE_CAP}
          lowerLabel="Lower score cap"
          raiseLabel="Raise score cap"
          onStep={(step) => onChange({ scoreCap: clampScoreCap(scoreCap + step * SCORE_CAP_STEP) })}
        />
        <Stepper
          className="np-minimal-rivals"
          label="NP min rivals"
          text={`${npMinimalRivals}`}
          title={`Show unplayed charts with ≥ ${npMinimalRivals} rival ${npMinimalRivals === 1 ? 'result' : 'results'}`}
          off={npMinimalRivals === MIN_NP_RIVALS}
          canLower={npMinimalRivals > MIN_NP_RIVALS}
          canRaise={npMinimalRivals < MAX_NP_RIVALS}
          lowerLabel="Lower minimal rivals for np"
          raiseLabel="Raise minimal rivals for np"
          onStep={(step) => onChange({ npMinimalRivals: clampNpMinimalRivals(npMinimalRivals + step) })}
        />
        <div
          className="switch count-by"
          role="radiogroup"
          aria-label="Count by"
          title="Count lost / non-matched / won rival results, or inferior / not played / superior charts"
        >
          <span className="stepper-label">Count by</span>
          {COUNT_BY_BUTTONS.map(({ value, label, title }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === countBy}
              className={value === countBy ? 'on' : undefined}
              title={title}
              onClick={() => value !== countBy  &&  onChange({ countBy: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
