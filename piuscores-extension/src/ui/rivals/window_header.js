import {
  clampNpMinimalRivals, clampRetryCooldown, clampScoreCap, displayName, loadPreferences, MAX_NP_RIVALS,
  MAX_RETRY_COOLDOWN, MAX_SCORE_CAP, MIN_NP_RIVALS, MIN_SCORE_CAP, savePreferences, SCORE_CAP_STEP,
} from '../../storage.js';
import { esc, statWords } from './common.js';

export const windowHeaderStyles = `
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid #2B4034; }
  .dlg-head h2 { margin: 0; font-size: 24px; font-weight: 600; }
  .head-settings { display: flex; align-items: center; gap: 20px; margin: 0 auto; }
  /* The label sits above the − value + row. */
  .stepper { display: grid; grid-template-columns: auto auto auto; align-items: center; gap: 2px 4px; color: #9AB3A3;
             font-size: 15px; font-variant-numeric: tabular-nums; }
  .stepper-label { grid-column: 1 / -1; text-align: center; font-size: 12px; line-height: 1.2; white-space: nowrap; }
  .stepper-value { min-width: 44px; text-align: center; color: #EAF5EC; }
  .stepper.off .stepper-value { color: #9AB3A3; }
  .stepper button { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px;
                    width: 24px; height: 24px; padding: 0; font: 600 16px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .stepper button:hover:not(:disabled) { color: #4FE33F; border-color: #4FE33F; }
  .stepper button:disabled { opacity: .35; cursor: default; }
  .btn.clear-data { color: #FF5A5A; border-color: #FF5A5A; }
  .btn.clear-data:hover { background: #2B1C1C; }
  /* Header buttons look like the rival links: grey until hovered. */
  .dlg-head .btn { box-shadow: none; background: rgba(0,0,0,.12); color: #9AB3A3; border-color: #2B4034; border-radius: 4px;
                   padding: 3px 10px; font: 400 13px/1.4 Roboto, Arial, sans-serif; }
  .dlg-head .btn:hover { color: #4FE33F; border-color: #4FE33F; background: #14201A; }
  .dlg-head .btn.clear-data:hover { color: #FF5A5A; border-color: #FF5A5A; background: #2B1C1C; }
  .head-stats { font-weight: 400; color: #9AB3A3; }
  .head-stats .blue { color: #3FA9F5; }
  .head-stats > span { opacity: .7; }
  .head-stats .zero { opacity: .2; }
  .dlg-close { background: none; border: none; color: #9AB3A3; font-size: 30px; line-height: 1;
               cursor: pointer; padding: 0 4px; }
  .dlg-close:hover { color: #EAF5EC; }
`;


// The window title with your totals, the score cap, retry cooldown and np minimal rivals, and the export / clear data / close buttons.
// `onChange` re-renders the window after a setting changed; `onCleared` runs after all data was cleared.
export function createWindowHeader(container, { exportTargets, onChange, onCleared, onClose }) {
  container.innerHTML = `<h2>Rivals</h2>
    <div class="head-settings">
      <div class="stepper score-cap" title="All scores above this cap are considered a draw with each other">
        <span class="stepper-label">Score cap</span>
        <button type="button" data-step="-1" aria-label="Lower score cap">−</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Raise score cap">+</button></div>
      <div class="stepper retry-cooldown" title="Hide lost charts you last played fewer than this many days ago">
        <span class="stepper-label">Retry cooldown</span>
        <button type="button" data-step="-1" aria-label="Shorten retry cooldown">−</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Lengthen retry cooldown">+</button></div>
      <div class="stepper np-minimal-rivals" title="Count an unplayed chart as np only when at least this many rivals played it">
        <span class="stepper-label">NP min rivals</span>
        <button type="button" data-step="-1" aria-label="Lower minimal rivals for np">−</button>
        <span class="stepper-value"></span>
        <button type="button" data-step="1" aria-label="Raise minimal rivals for np">+</button></div>
    </div>
    <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
    <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
    <button class="dlg-close" type="button" aria-label="Close">×</button>`;

  const title = container.querySelector('h2');
  const scoreCapControl = container.querySelector('.score-cap');
  const retryCooldownControl = container.querySelector('.retry-cooldown');
  const npMinimalRivalsControl = container.querySelector('.np-minimal-rivals');

  container.querySelector('.export').addEventListener('click', () => {
    exportTargets().catch((error) => console.error('[piuscores]', error));
  });

  container.querySelector('.clear-data').addEventListener('click', async () => {
    if (! window.confirm('Clear all PIU Scores data saved by this extension? This cannot be undone.'))
      return;

    try {
      await chrome.storage.local.clear();
      await onCleared();
    } catch (error) {
      console.error('[piuscores] Unable to clear saved data', error);
    }
  });

  container.querySelector('.dlg-close').addEventListener('click', () => onClose());

  // `update(preferences, step)` returns the preference changes for a −/+ click.
  function bindStepper(control, update) {
    control.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-step]');
      if (! button)
        return;

      try {
        await savePreferences(update(await loadPreferences(), Number(button.dataset.step)));
        await onChange();
      } catch (error) {
        console.error('[piuscores] Unable to save setting', error);
      }
    });
  }

  bindStepper(scoreCapControl, ({ scoreCap }, step) =>
    ({ scoreCap: clampScoreCap(scoreCap + step * SCORE_CAP_STEP) }));

  bindStepper(retryCooldownControl, ({ retryCooldown }, step) =>
    ({ retryCooldown: clampRetryCooldown(retryCooldown + step) }));

  bindStepper(npMinimalRivalsControl, ({ npMinimalRivals }, step) =>
    ({ npMinimalRivals: clampNpMinimalRivals(npMinimalRivals + step) }));

  function renderStepper(control, text, value, min, max, isOff) {
    control.classList.toggle('off', isOff);
    control.querySelector('.stepper-value').textContent = text;
    control.querySelector('[data-step="-1"]').disabled = value <= min;
    control.querySelector('[data-step="1"]').disabled = value >= max;
  }

  function render(me, totals, { scoreCap, retryCooldown, npMinimalRivals }) {
    const text = me?.name ? `Rivals for ${displayName(me.name)}` : 'Rivals';
    title.innerHTML = `${esc(text)}<span class="head-stats"> — ${statWords(totals)}</span>`;

    renderStepper(scoreCapControl, `${scoreCap / 1000}k`, scoreCap, MIN_SCORE_CAP, MAX_SCORE_CAP, scoreCap >= MAX_SCORE_CAP);
    renderStepper(retryCooldownControl, retryCooldown ? `${retryCooldown}d` : 'off', retryCooldown, 0, MAX_RETRY_COOLDOWN,
      retryCooldown === 0);
    renderStepper(npMinimalRivalsControl, `${npMinimalRivals}`, npMinimalRivals, MIN_NP_RIVALS, MAX_NP_RIVALS,
      npMinimalRivals === MIN_NP_RIVALS);
  }

  return { render };
}
