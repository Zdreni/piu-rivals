// The piu-rivals status box on piuscores player pages, in its own shadow root so the page's
// styles don't leak in. It sits top right, clear of the old extension's buttons (bottom left)
// and toasts (bottom right).
const styles = `
  .box { position: fixed; top: 72px; right: 16px; z-index: 2147483647; max-width: 300px;
         background: #14201A; color: #EAF5EC; border-left: 4px solid #4FE33F; border-radius: 6px;
         padding: 10px 12px; font: 13px/1.4 Roboto, Arial, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.5);
         display: flex; flex-direction: column; gap: 8px; }
  .box[hidden] { display: none; }
  .box.unknown { border-left-color: #FFB020; }
  .box.error { border-left-color: #FF2A00; }
  .title { font-weight: 600; color: #4FE33F; }
  .box.unknown .title { color: #FFB020; }
  .box.error .title { color: #FF2A00; }
  .muted { color: #9FB5A4; }
  .btn { align-self: flex-start; background: #14201A; color: #4FE33F; border: 1px solid #4FE33F;
         border-radius: 6px; padding: 7px 10px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer; }
  .btn:hover:not(:disabled) { background: #1C2B22; }
  .btn:disabled { opacity: .5; cursor: default; }
  .btn[hidden] { display: none; }
`;

const ACTIVE_STATUSES = ['queued', 'running'];


function ago(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60)
    return (minutes <= 1  ?  'just now'  :  `${minutes} minutes ago`);

  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return (hours === 1  ?  'an hour ago'  :  `${hours} hours ago`);

  const days = Math.round(hours / 24);
  return (days === 1  ?  'yesterday'  :  `${days} days ago`);
}


const counts = (run)  =>  `${run.sessionsAdded} new sessions, ${run.playsAdded} plays`;


function runText(run) {
  if (run.status === 'queued')
    return ['Queued for scraping', 'Waiting for the scrape worker…'];

  if (run.status === 'running')
    return ['Scraping', `${counts(run)} so far…`];

  if (run.status === 'done')
    return ['Scraped', run.failures  ?  `${counts(run)}; ${run.failures} failed`  :  counts(run)];

  return [`Scrape ${run.status}`, run.failures  ?  `${run.failures} failed`  :  `${counts(run)} before it stopped`];
}


// The player's own state in the run. A run can hold other players too (players added one after
// another are scraped together); its counts then cover them all, so they're shown only for a run
// of this player alone.
function playerText(run, runPlayer) {
  const solo = run.playersTotal <= 1;
  const others = run.playersTotal - 1;
  switch (runPlayer.state) {
    case 'waiting': {
      const playersAhead = runPlayer.index - run.playersDone;
      return ['Queued for scraping', (run.status === 'queued'  ||  playersAhead <= 0)
        ?  'Waiting for the scrape worker…'
        :  `${playersAhead} player${(playersAhead === 1  ?  ''  :  's')} ahead in the run…`];
    }
    case 'running':
      return ['Scraping', solo  ?  `${counts(run)} so far…`  :  `Player ${runPlayer.index + 1} of ${run.playersTotal} in the run…`];
    case 'done':
      return ['Scraped', solo  ?  counts(run)  :  `Scraped in a run with ${others} other player${(others === 1  ?  ''  :  's')}`];
    case 'failed':
      return ['Scrape failed', 'The run on piu-rivals has the error'];
    default:
      return ['Scrape stopped', `The run was ${run.status} before this player`];
  }
}


const ADD_LABEL = 'Add to piu-rivals and scrape';
const ADDED_LABEL = 'Already in piu-rivals';


// The button that adds and scrapes the player. Nothing is scraped without it; it is disabled while
// a scrape of the player is under way and once the player is in piu-rivals.
function buttonFor(view) {
  if (view.run)
    return { label: 'Scraping…', enabled: false };

  return (view.state === 'known'  ?  { label: ADDED_LABEL, enabled: false }  :  { label: ADD_LABEL, enabled: true });
}


// What the box says for a view: { state, player, run, runPlayer, finished, name, message }, where
// finished is { run, runPlayer } of the run that last scraped the player.
function describe(view) {
  if (view.state === 'error')
    return { kind: 'error', title: 'piu-rivals', detail: view.message, button: null };

  const button = buttonFor(view);
  const { run, runPlayer } = (view.run  ?  view  :  view.finished  ??  {});
  if (run) {
    const [title, detail] = (runPlayer  ?  playerText(run, runPlayer)  :  runText(run));
    const failed = (runPlayer
      ?  ['failed', 'skipped'].includes(runPlayer.state)
      :  ! ACTIVE_STATUSES.includes(run.status)  &&  run.status !== 'done');
    return { kind: (failed  ?  'error'  :  'known'), title, detail, button };
  }

  if (view.state === 'known') {
    const lastScrapedAt = view.player.lastScrapedAt;
    return { kind: 'known', title: 'In piu-rivals', detail: (lastScrapedAt  ?  `Last scraped ${ago(lastScrapedAt)}`  :  'Not scraped yet'), button };
  }

  return { kind: 'unknown', title: 'Not in piu-rivals', detail: `${view.name  ||  'This player'} isn't stored yet.`, button };
}


export function createBadge({ onRegister }) {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles}</style>
    <div class="box" hidden>
      <div class="title"></div>
      <div class="detail muted"></div>
      <button class="btn" hidden></button>
    </div>`;

  const box = root.querySelector('.box');
  const button = root.querySelector('.btn');

  button.addEventListener('click', ()  => {
    button.disabled = true;
    onRegister();
  });


  // The page may drop the host when it re-renders its body, so it is put back on every call.
  function attach() {
    if (! host.isConnected)
      document.body.appendChild(host);
  }

  function show(view) {
    attach();

    const { kind, title, detail, button: buttonState } = describe(view);
    box.className = `box ${kind}`;
    box.querySelector('.title').textContent = title;
    box.querySelector('.detail').textContent = detail;
    button.hidden = ! buttonState;
    button.textContent = buttonState?.label  ??  '';
    button.disabled = ! buttonState?.enabled;
    box.hidden = false;
  }

  return {
    attach,
    show,
    hide: ()  =>  { box.hidden = true; },
  };
}
