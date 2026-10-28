import { type Kysely, type Transaction, sql } from 'kysely';
import type { Database, NewPlay, Player } from '../db/schema.ts';
import { newTries } from './play_matching.ts';
import type { Checkpoint } from './scan_plan.ts';
import type { ParsedPlay, SessionCard } from './session_page.ts';

export interface StoredSessionResult {
  playsAdded: number;
  bestsImproved: number;
}

type Db = Kysely<Database>;
type Trx = Transaction<Database>;

const chartKey = (songKey: string, chartType: string, level: number)  =>  `${songKey}|${chartType}|${level}`;


export const loadPlayer = (db: Db, playerId: number)  =>
  db.selectFrom('players').selectAll().where('id', '=', playerId).executeTakeFirst();


export function playerCheckpoint(player: Player): Checkpoint {
  const session = (title: string | null, timestamp: string | null)  =>
    ((title !== null  &&  timestamp !== null)  ?  { title, timestamp }  :  null);

  return {
    latest: session(player.last_session_title, player.last_session_timestamp),
    anchor: session(player.anchor_session_title, player.anchor_session_timestamp),
  };
}


// PUMBILITY never decreases, so a lower value is ignored.
export async function savePlayerInfo(db: Db, playerId: number, name: string | null, pumbility: number | null) {
  await db.updateTable('players')
    .set((eb)  =>  ({
      ...(name  ?  { name }  :  {}),
      ...(pumbility !== null
        ?  { pumbility: sql<number>`GREATEST(COALESCE(${eb.ref('pumbility')}, 0), ${pumbility})` }
        :  {}),
      last_scraped_at: sql<string>`CURRENT_TIMESTAMP`,
    }))
    .where('id', '=', playerId)
    .execute();
}


// For a rescan: forgets the player's plays, best results and checkpoint.
export async function resetPlayer(db: Db, playerId: number) {
  await db.transaction().execute(async (trx)  => {
    await trx.deleteFrom('best_results').where('player_id', '=', playerId).execute();
    await trx.deleteFrom('plays').where('player_id', '=', playerId).execute();
    await trx.updateTable('players')
      .set({
        last_session_no: 0,
        last_session_title: null,
        last_session_timestamp: null,
        anchor_session_title: null,
        anchor_session_timestamp: null,
      })
      .where('id', '=', playerId)
      .execute();
  });
}


async function chartIds(trx: Trx, plays: ParsedPlay[]): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  if (! plays.length)
    return ids;

  // A new track's short title starts as its title.
  const songs = [...new Map(plays.map((p)  =>  [p.songKey, p.songTitle])).entries()];
  await trx.insertInto('tracks')
    .values(songs.map(([songKey, title])  =>  ({ song_key: songKey, title, short_title: title })))
    .ignore()
    .execute();

  const trackIds = new Map((await trx.selectFrom('tracks')
    .select(['id', 'song_key'])
    .where('song_key', 'in', songs.map(([songKey])  =>  songKey))
    .execute()).map((row)  =>  [row.song_key, row.id]));

  const unique = [...new Map(plays.map((p)  =>  [chartKey(p.songKey, p.chartType, p.level), p])).values()];
  await trx.insertInto('charts')
    .values(unique.map((p)  =>  ({ track_id: trackIds.get(p.songKey)!, chart_type: p.chartType, level: p.level })))
    .ignore()
    .execute();

  const rows = await trx.selectFrom('charts as c')
    .innerJoin('tracks as t', 't.id', 'c.track_id')
    .select(['c.id', 't.song_key', 'c.chart_type', 'c.level'])
    .where((eb)  =>  eb.or(unique.map((p)  =>  eb.and([
      eb('c.track_id', '=', trackIds.get(p.songKey)!),
      eb('c.chart_type', '=', p.chartType),
      eb('c.level', '=', p.level),
    ]))))
    .execute();

  for (const row of rows)
    ids.set(chartKey(row.song_key, row.chart_type, row.level), row.id);

  return ids;
}


// Recomputes the player's best results on `chartIdList`. The best try is the highest score,
// the earliest one on ties; its improvement is how much it rose over the highest earlier try, by
// play order. Returns how many best scores were raised or added.
async function updateBests(trx: Trx, playerId: number, chartIdList: number[]): Promise<number> {
  if (! chartIdList.length)
    return 0;

  const { rows: fresh } = await sql<{
    chart_id: number; play_id: number; score: number; improvement: number | null; last_played_on: string | null; tries: number;
  }>`
    SELECT chart_id, id AS play_id, score, IF(score > previous_best, score - previous_best, NULL) AS improvement,
      last_played_on, tries
    FROM (
      SELECT id, chart_id, score, played_on,
        ROW_NUMBER() OVER (PARTITION BY chart_id ORDER BY score DESC, played_on IS NULL, played_on, id) AS place,
        MAX(score) OVER (PARTITION BY chart_id ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS previous_best,
        MAX(played_on) OVER (PARTITION BY chart_id) AS last_played_on,
        COUNT(*) OVER (PARTITION BY chart_id) AS tries
      FROM plays
      WHERE player_id = ${playerId} AND chart_id IN (${sql.join(chartIdList)})
    ) ranked
    WHERE place = 1`.execute(trx);

  const stored = new Map((await trx.selectFrom('best_results as b')
    .innerJoin('plays as p', 'p.id', 'b.play_id')
    .select(['b.chart_id', 'b.play_id', 'b.last_played_on', 'b.tries', 'p.score'])
    .where('b.player_id', '=', playerId)
    .where('b.chart_id', 'in', chartIdList)
    .execute()).map((row)  =>  [row.chart_id, row]));

  const changed = fresh.filter((row)  => {
    const old = stored.get(row.chart_id);
    return ! old  ||  Number(old.play_id) !== Number(row.play_id)  ||  old.last_played_on !== row.last_played_on
      ||  old.tries !== Number(row.tries);
  });

  for (const row of changed) {
    const values = {
      play_id: Number(row.play_id),
      improvement: (row.improvement === null  ?  null  :  Number(row.improvement)),
      last_played_on: row.last_played_on,
      tries: Number(row.tries),
      updated_at: sql<string>`CURRENT_TIMESTAMP(3)`,
    };

    await trx.insertInto('best_results')
      .values({ player_id: playerId, chart_id: row.chart_id, ...values })
      .onDuplicateKeyUpdate(values)
      .execute();
  }

  return changed.filter((row)  =>  row.score > (stored.get(row.chart_id)?.score  ??  -1)).length;
}


// Stores one scanned session and moves the player's checkpoint to it, all in one transaction.
// A grown session (the previous latest one, with re-imported tries) only adds the tries not
// stored from it before; a new session adds all of its tries under the next session number.
export async function storeSession(db: Db, options: {
  playerId: number;
  card: SessionCard;
  date: string | null;
  plays: ParsedPlay[];
  grown: boolean;
}): Promise<StoredSessionResult> {
  const { playerId, card, date, plays, grown } = options;
  return db.transaction().execute(async (trx)  => {
    const player = await trx.selectFrom('players').selectAll().where('id', '=', playerId).forUpdate().executeTakeFirst();
    if (! player)
      throw new Error(`Player ${playerId} is not stored`);

    const sessionNo = (grown  ?  player.last_session_no  :  player.last_session_no + 1);
    const ids = await chartIds(trx, plays);
    const scanned = plays.map((p)  =>  ({
      ...p,
      chartId: ids.get(chartKey(p.songKey, p.chartType, p.level))!,
    }));

    let toInsert = scanned;
    if (grown) {
      const stored = await trx.selectFrom('plays')
        .select(['chart_id as chartId', 'score', 'passed', 'perfect', 'great', 'good', 'bad', 'miss', 'max_combo as maxCombo'])
        .where('player_id', '=', playerId)
        .where('session_no', '=', sessionNo)
        .execute();

      toInsert = newTries(stored.map((t)  =>  ({ ...t, passed: !! t.passed })), scanned);
    }

    if (toInsert.length) {
      await trx.insertInto('plays')
        .values(toInsert.map((p): NewPlay  =>  ({
          player_id: playerId,
          chart_id: p.chartId,
          session_no: sessionNo,
          played_on: date,
          score: p.score,
          grade: p.grade,
          passed: (p.passed  ?  1  :  0),
          plate: p.plate,
          perfect: p.perfect,
          great: p.great,
          good: p.good,
          bad: p.bad,
          miss: p.miss,
          max_combo: p.maxCombo,
        })))
        .execute();
    }

    const bestsImproved = await updateBests(trx, playerId, [...new Set(toInsert.map((p)  =>  p.chartId))]);
    await moveCheckpoint(trx, player, card, grown, sessionNo);
    return { playsAdded: toInsert.length, bestsImproved };
  });
}


// Moves the player's checkpoint to a session of another mix, whose plays aren't stored.
export async function skipSession(db: Db, options: { playerId: number; card: SessionCard; grown: boolean }) {
  const { playerId, card, grown } = options;

  await db.transaction().execute(async (trx)  => {
    const player = await trx.selectFrom('players').selectAll().where('id', '=', playerId).forUpdate().executeTakeFirst();
    if (! player)
      throw new Error(`Player ${playerId} is not stored`);

    await moveCheckpoint(trx, player, card, grown, player.last_session_no);
  });
}


// A grown session stays the latest one; a new one becomes it, and the previous latest the anchor.
async function moveCheckpoint(trx: Trx, player: Player, card: SessionCard, grown: boolean, sessionNo: number) {
  const latest = { last_session_title: card.title, last_session_timestamp: card.timestamp };
  await trx.updateTable('players')
    .set((grown
      ?  latest
      :  {
        ...latest,
        last_session_no: sessionNo,
        anchor_session_title: player.last_session_title,
        anchor_session_timestamp: player.last_session_timestamp,
      }))
    .where('id', '=', player.id)
    .execute();
}
