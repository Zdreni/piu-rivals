import {
  clampScoreCap, displayName, loadPreferences, MAX_SCORE_CAP, MIN_SCORE_CAP, savePreferences, SCORE_CAP_STEP,
} from '../../storage.js';
import { esc, statWords } from './common.js';

export const windowHeaderStyles = `
  .dlg-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
              border-bottom: 1px solid #2B4034; }
  .dlg-head h2 { margin: 0; font-size: 24px; font-weight: 600; }
  .score-cap { display: flex; align-items: center; gap: 4px; margin: 0 auto; color: #9AB3A3;
               font-size: 15px; font-variant-numeric: tabular-nums; }
  .score-cap-value { min-width: 44px; text-align: center; color: #EAF5EC; }
  .score-cap.off .score-cap-value { color: #9AB3A3; }
  .score-cap button { background: #1C2B22; color: #9AB3A3; border: 1px solid #2B4034; border-radius: 4px;
                      width: 24px; height: 24px; padding: 0; font: 600 16px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .score-cap button:hover:not(:disabled) { color: #4FE33F; border-color: #4FE33F; }
  .score-cap button:disabled { opacity: .35; cursor: default; }
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


// The window title with your totals, the score cap, and the export / clear data / close buttons.
// `onChange` re-renders the window after the score cap changed; `onCleared` runs after all data was cleared.
export function createWindowHeader(container, { exportTargets, onChange, onCleared, onClose }) {
  container.innerHTML = `<h2>Rivals</h2>
    <div class="score-cap" title="All scores above this cap are considered a draw with each other">Score cap
      <button type="button" data-cap-step="-1" aria-label="Lower score cap">−</button>
      <span class="score-cap-value"></span>
      <button type="button" data-cap-step="1" aria-label="Raise score cap">+</button></div>
    <button class="btn export" type="button" title="Download charts where rivals beat you or you have no score">Export targets</button>
    <button class="btn clear-data" type="button" title="Clear all PIU Scores data saved by this extension">Clear data</button>
    <button class="dlg-close" type="button" aria-label="Close">×</button>`;
  const title = container.querySelector('h2');
  const scoreCapControl = container.querySelector('.score-cap');

  container.querySelector('.export').addEventListener('click', () => {
    exportTargets().catch((error) => console.error('[piuscores]', error));
  });
  container.querySelector('.clear-data').addEventListener('click', async () => {
    if (!window.confirm('Clear all PIU Scores data saved by this extension? This cannot be undone.')) return;

    try {
      await chrome.storage.local.clear();
      await onCleared();
    } catch (error) {
      console.error('[piuscores] Unable to clear saved data', error);
    }
  });
  container.querySelector('.dlg-close').addEventListener('click', () => onClose());
  scoreCapControl.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-cap-step]');
    if (!button) return;
    try {
      const { scoreCap } = await loadPreferences();
      await savePreferences({ scoreCap: clampScoreCap(scoreCap + Number(button.dataset.capStep) * SCORE_CAP_STEP) });
      await onChange();
    } catch (error) {
      console.error('[piuscores] Unable to save score cap', error);
    }
  });

  function render(me, totals, scoreCap) {
    const text = me?.name ? `Rivals for ${displayName(me.name)}` : 'Rivals';
    title.innerHTML = `${esc(text)}<span class="head-stats"> — ${statWords(totals)}</span>`;

    scoreCapControl.classList.toggle('off', scoreCap >= MAX_SCORE_CAP);
    scoreCapControl.querySelector('.score-cap-value').textContent = `${scoreCap / 1000}k`;
    scoreCapControl.querySelector('[data-cap-step="-1"]').disabled = scoreCap <= MIN_SCORE_CAP;
    scoreCapControl.querySelector('[data-cap-step="1"]').disabled = scoreCap >= MAX_SCORE_CAP;
  }

  return { render };
}
