import { StatWords } from './format.tsx';
import {
  clampLevel, clampNpMinimalRivals, clampScoreCap, type CountBy, type LevelRange, MAX_LEVEL, MAX_NP_RIVALS, MAX_SCORE_CAP, MIN_LEVEL,
  MIN_NP_RIVALS, MIN_SCORE_CAP, type Preferences, SCORE_CAP_STEP,
} from './preferences.ts';
import { type Counts, STAT_WORDS } from './stats.ts';


// A label above a − value + row, and (in the preferences panel) the title spelled out under them.
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
      <span className="setting-hint">{title}</span>
    </div>
  );
}


const COUNT_BY_BUTTONS: { value: CountBy; label: string; title: string }[] = [
  { value: 'results', label: 'Results', title: "Count each rival's result separately" },
  { value: 'charts', label: 'Charts', title: 'Count each chart once: inferior if any rival beats you, otherwise not played or superior' },
];


// The score cap, np minimal rivals, level range and count by settings, in the header and in the preferences panel of narrow
// screens. `levels` is the level range in use, whether set or following your scores. While a rival is `solo`, results
// are counted whatever the count by setting says, and the setting is locked.
export function PreferenceControls({ preferences, levels, solo, onChange }: {
  preferences: Preferences;
  levels: LevelRange;
  solo: boolean;
  onChange: (changes: Partial<Preferences>) => void;
}) {
  const { scoreCap, npMinimalRivals } = preferences;
  const { minLevel, maxLevel } = levels;
  const countBy = solo ? 'results' : preferences.countBy;
  const countByTitle = solo
    ? 'Solo: results are always counted'
    : 'Count per rival result, or per chart';
  return (
    <>
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
        label="Unplayed: min rivals"
        text={`${npMinimalRivals}`}
        title={`Show unplayed charts with ≥ ${npMinimalRivals} rival ${npMinimalRivals === 1 ? 'result' : 'results'}`}
        off={npMinimalRivals === MIN_NP_RIVALS}
        canLower={npMinimalRivals > MIN_NP_RIVALS}
        canRaise={npMinimalRivals < MAX_NP_RIVALS}
        lowerLabel="Lower minimal rivals for np"
        raiseLabel="Raise minimal rivals for np"
        onStep={(step) => onChange({ npMinimalRivals: clampNpMinimalRivals(npMinimalRivals + step) })}
      />
      <Stepper
        className="min-level"
        label="Min level"
        text={`${minLevel}`}
        title={minLevel === MIN_LEVEL ? 'Show charts of every level' : `Show charts from level ${minLevel} up`}
        off={minLevel === MIN_LEVEL}
        canLower={minLevel > MIN_LEVEL}
        canRaise={minLevel < maxLevel}
        lowerLabel="Lower minimal level"
        raiseLabel="Raise minimal level"
        onStep={(step) => onChange({ minLevel: clampLevel(minLevel + step) })}
      />
      <Stepper
        className="max-level"
        label="Max level"
        text={maxLevel >= MAX_LEVEL ? `${MAX_LEVEL}+` : `${maxLevel}`}
        title={maxLevel >= MAX_LEVEL ? 'No highest level' : `Show charts up to level ${maxLevel}`}
        off={maxLevel >= MAX_LEVEL}
        canLower={maxLevel > minLevel}
        canRaise={maxLevel < MAX_LEVEL}
        lowerLabel="Lower maximal level"
        raiseLabel="Raise maximal level"
        onStep={(step) => onChange({ maxLevel: clampLevel(maxLevel + step) })}
      />
      <div
        className="switch count-by"
        role="radiogroup"
        aria-label="Count by"
        title={countByTitle}
      >
        <span className="stepper-label">Count by</span>
        {COUNT_BY_BUTTONS.map(({ value, label, title }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === countBy}
            className={value === countBy ? 'on' : undefined}
            title={solo ? undefined : title}
            disabled={solo}
            onClick={() => value !== countBy  &&  onChange({ countBy: value })}
          >
            {label}
          </button>
        ))}
        <span className="setting-hint">{countByTitle}</span>
      </div>
    </>
  );
}


// The title, named by what is counted, with your totals, and the settings (left out on narrow screens, where the
// preferences panel has them). `status` is a short note on loading scores, if any. While a rival is `solo`, results
// are counted whatever the count by setting says.
export function WindowHeader({ totals, preferences, levels, solo, status, onChange }: {
  totals: Counts;
  preferences: Preferences;
  levels: LevelRange;
  solo: boolean;
  status: { text: string; error: boolean } | null;
  onChange: (changes: Partial<Preferences>) => void;
}) {
  const countBy = solo ? 'results' : preferences.countBy;
  return (
    <div className="dlg-head">
      <h2>
        {countBy === 'charts' ? 'Rival charts' : 'Rival results'}
        <span className="head-stats"> — <StatWords counts={totals} words={STAT_WORDS[countBy]} ties={solo} /></span>
      </h2>
      {status  &&  <span className={`head-status${status.error ? ' error' : ''}`} role={status.error ? 'alert' : undefined}>{status.text}</span>}
      <div className="head-settings">
        <PreferenceControls preferences={preferences} levels={levels} solo={solo} onChange={onChange} />
      </div>
    </div>
  );
}
