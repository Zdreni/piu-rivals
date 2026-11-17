import type { Chart } from '@piu-rivals/shared';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCloseOnBack } from '../../components/close_on_back.ts';
import { ScoreGraph } from '../../components/graphs/score_graph.tsx';
import { graphLevels, levelAverages } from '../../data/level_averages.ts';
import { displayName, type PlayerBests } from '../../data/model.ts';
import { useOtherBests } from '../../data/other_players.ts';
import type { LevelRange } from '../../data/preferences.ts';
import './stats_popup.css';

const CHART_TYPES = [{ chartType: 'S', title: 'Singles' }, { chartType: 'D', title: 'Doubles' }];


// A player's name in the legend, leading to their PIU Scores page.
const renderPlayerLink = ({ id, name }: { id: string; name: string })  =>  (
  <a className="stats-player-link" href={`https://piuscores.arroweclip.se/Player/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
    {displayName(name)}
  </a>
);


// Your score graphs and a player's, singles and doubles, over the page. A player who isn't in `bests` (one on the
//  Others tab) has their scores loaded here.
export function StatsPopup({ me, player, charts, bests, levelRange, onClose }: {
  // Full names, with their "#1234" tag.
  me: { id: string; name: string };
  player: { id: string; name: string };
  charts: Map<number, Chart>;
  bests: Map<string, PlayerBests>;
  levelRange: LevelRange;
  onClose: () => void;
}) {
  const otherBests = useOtherBests((bests.has(player.id)  ?  null  :  player.id));
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(()  => {
    const escape = (event: KeyboardEvent)  =>  event.key === 'Escape'  &&  close.current();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    window.addEventListener('keydown', escape);
    return ()  => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', escape);
    };
  }, []);

  useCloseOnBack(close);

  const theirScores = (bests.has(player.id)
    ?  { charts, playerBests: bests.get(player.id) }
    :  (otherBests !== null  &&  typeof otherBests === 'object')
      ?  { charts: otherBests.charts, playerBests: otherBests.bests }
      :  null);

  const renderGraph = ({ chartType, title }: { chartType: string; title: string })  => {
    const seriesList = [
      { name: displayName(me.name), isMine: true, levelAverages: levelAverages(charts, bests.get(me.id), chartType, levelRange) },
      { name: displayName(player.name), isMine: false, levelAverages: levelAverages(theirScores!.charts, theirScores!.playerBests, chartType, levelRange) },
    ];

    const levels = graphLevels(seriesList.map((series)  =>  series.levelAverages));
    if (! levels.length)
      return <p key={chartType} className="stats-empty">No {title.toLowerCase()} scores in your level range.</p>;

    return <ScoreGraph key={chartType} title={title} levels={levels} seriesList={seriesList} />;
  };

  return createPortal(
    <div className="rivals stats-overlay" role="dialog" aria-modal="true" aria-label={`Stats: ${displayName(player.name)}`}
      onClick={(event)  =>  event.target === event.currentTarget  &&  close.current()}>
      <div className="stats-popup">
        <div className="stats-head">
          <span className="stats-title">Average scores by level</span>
          <span className="stats-legend">
            <span className="score-graph-swatch mine" />{renderPlayerLink(me)}
            <span className="score-graph-swatch theirs" />{renderPlayerLink(player)}
          </span>
          <button className="card-close" type="button" aria-label="Close" title="Close" onClick={()  =>  close.current()}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" /></svg>
          </button>
        </div>
        <div className="stats-graphs">
          {theirScores
            ?  CHART_TYPES.map(renderGraph)
            :  <p className={(typeof otherBests === 'string'  ?  'stats-empty error'  :  'stats-empty')}>{(typeof otherBests === 'string'  ?  otherBests  :  'Loading scores…')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
