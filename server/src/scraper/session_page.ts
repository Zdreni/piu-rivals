import * as cheerio from 'cheerio';

// Reads a rendered piuscores player Sessions page. All functions are pure: they take the page
// HTML, so they work the same on the live page and on saved fixtures.

export interface SessionCard {
  // "Phoenix 2", "Phoenix", or null for other mixes.
  mix: string | null;
  // Card text after the mix, e.g. "Official Import · MEREPOOHUNK #8250".
  title: string;
  // Card time, e.g. "Sun 11 Oct · 7:43 PM". Formatted by piuscores' server, so it doesn't depend
  // on the browser's time zone.
  timestamp: string;
  // The card of the session shown below the cards.
  isOpen: boolean;
}

export interface SessionsPage {
  playerName: string | null;
  cards: SessionCard[];
  hasOlderPage: boolean;
  hasNewerPage: boolean;
}

export interface OpenSession {
  title: string;
  // Header line, e.g. "Phoenix 2 · 10/11/2026 7:43 PM · 37 min".
  summary: string;
  mix: string;
  // Session date as "YYYY-MM-DD", or null when the format is different.
  date: string | null;
  // The "Plays" tally, counting stage breaks too.
  playsTotal: number | null;
  pumbility: number | null;
}

export interface ParsedPlay {
  songKey: string;
  songTitle: string;
  chartType: string;
  level: number;
  score: number;
  // Grade image name without the broken mark, e.g. "aa", "sssplus".
  grade: string | null;
  // False for a broken play: the life bar broke, but the play went on to the result screen.
  passed: boolean;
  plate: string | null;
  perfect: number | null;
  great: number | null;
  good: number | null;
  bad: number | null;
  miss: number | null;
  maxCombo: number | null;
}

export interface SessionPlays {
  plays: ParsedPlay[];
  // All rows in the "All plays" list, including stage breaks and other mixes.
  rows: number;
  // Rows skipped because their chart couldn't be read.
  unreadable: number;
}

const clean = (value: string)  =>  value.replace(/\s+/g, ' ').trim();


export const parseNumber = (value: string | undefined): number | null  => {
  const digits = (value  ||  '').replace(/[^\d]/g, '');
  return (digits  ?  Number(digits)  :  null);
};


export function cardMix(meta: string): string | null {
  if (/^Phoenix 2(?:\s|$)/i.test(meta))
    return 'Phoenix 2';

  if (/^Phoenix(?:\s|$)/i.test(meta))
    return 'Phoenix';

  return null;
}


export function parseSessionsPage(html: string): SessionsPage {
  const $ = cheerio.load(html);
  const heading = clean($('main h5').first().text());

  const cards = $('[data-testid="session-card"]').toArray().map((element)  => {
    const card = $(element);
    const meta = clean(card.find('.sbd-card-meta').text());
    const mix = cardMix(meta);
    return {
      mix,
      title: (mix  ?  meta.slice(mix.length).replace(/^\s*(?:·|-)\s*/, '').trim()  :  meta),
      timestamp: clean(card.find('.sbd-card-when').text()),
      isOpen: card.hasClass('sbd-card-now'),
    };
  });

  const pageButton = (label: string)  => {
    const button = $(`[data-testid="session-pagination"] button[aria-label="${label}"]`);
    return button.length > 0  &&  button.attr('disabled') === undefined;
  };

  return {
    playerName: heading.replace(/\s+[—–-]\s+Sessions$/i, '').trim()  ||  null,
    cards,
    hasOlderPage: pageButton('Next page'),
    hasNewerPage: pageButton('Previous page'),
  };
}


// The header reads like "Phoenix 2 · 9/24/2026 8:27 PM · 740 min"; only the date right after the
// mix is parsed.
export function parseSummaryDate(summary: string): string | null {
  const match = (summary.split('·')[1]  ||  '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/);
  if (! match)
    return null;

  const [, month, day, year] = match;
  return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
}


export function parseOpenSession(html: string): OpenSession | null {
  const $ = cheerio.load(html);
  const hero = $('[data-testid="session-hero"]');
  if (! hero.length)
    return null;

  // The "imported from ..." tag is nested in the header line; it's left out.
  const when = hero.find('.sbd-hero-when').first().clone();
  when.find('.sbd-hero-tag').remove();

  const summary = clean(when.text());
  const playsTally = hero.find('.sbd-tally > div').toArray()
    .find((item)  =>  clean($(item).find('.sbd-tally-k').text()) === 'Plays');

  return {
    title: clean(hero.find('.sbd-hero-title').first().text()),
    summary,
    mix: clean(summary.split('·')[0]  ||  ''),
    date: parseSummaryDate(summary),
    playsTotal: (playsTally  ?  parseNumber($(playsTally).find('.sbd-tally-v').text())  :  null),
    pumbility: parseNumber($('[data-testid="session-ceremony"] .sbd-pumb-big').first().text()),
  };
}


// Card times look like "Mon 12 Oct · 6:55 PM", header times like "10/12/2026 6:55 PM".
export function sameSessionTime(cardTimestamp: string, summary: string): boolean {
  const card = cardTimestamp.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s*·\s*(\d{1,2}:\d{2}\s*[AP]M)\b/i);
  // No trailing \b: imported sessions may glue the next text right after AM/PM.
  const header = summary.match(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (! card  ||  ! header)
    return false;

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const time = (value: string)  =>  value.replace(/\s+/g, '').toLowerCase();
  return Number(card[1]) === Number(header[2])
    &&  months.indexOf(card[2]!.toLowerCase()) + 1 === Number(header[1])
    &&  time(card[3]!) === time(header[3]!);
}


// A card's title up to its first "·", e.g. "Play Session" of "Play Session · 77 min". What follows
// may change: a session's duration grows when more scores are imported into it.
export const sessionName = (title: string)  =>  clean(title.split('·')[0]  ||  '');


// Whether two cards are the same session, though it may have grown in between.
export const sameCard = (a: SessionCard, b: SessionCard)  =>
  a.mix === b.mix  &&  sessionName(a.title) === sessionName(b.title)  &&  a.timestamp === b.timestamp;


// Lists why the open session doesn't match `card` yet; empty once it does.
export function openSessionMismatches(open: OpenSession | null, card: SessionCard): string[] {
  if (! open)
    return ['session header is missing'];

  const mismatches = [];
  if (open.mix !== card.mix)
    mismatches.push(`mix: opened "${open.mix}", expected "${card.mix}"`);

  const cardTitle = sessionName(card.title);
  if (open.title !== cardTitle)
    mismatches.push(`title: opened "${open.title}", card "${cardTitle}"`);

  if (! sameSessionTime(card.timestamp, open.summary))
    mismatches.push(`time: opened "${open.summary}", card "${card.timestamp}"`);

  return mismatches;
}


// "D24" → D, 24. Other chart labels (e.g. co-op) are read the same way when they end in a number.
export function parseChartLabel(label: string): { chartType: string; level: number } | null {
  const match = clean(label).match(/^([A-Za-z][A-Za-z-]*?)\s*(\d+)$/);
  return (match  ?  { chartType: match[1]!.toUpperCase(), level: Number(match[2]) }  :  null);
}


const imageName = (src: string | undefined, folder: string)  =>
  src?.match(new RegExp(`/${folder}/([^/?#]+)\\.\\w+(?:[?#].*)?$`))?.[1]  ??  null;


// Reads the open session's "All plays" list. Only Phoenix 2 charts with a score are returned;
// stage breaks have none.
export function parseSessionPlays(html: string): SessionPlays {
  const $ = cheerio.load(html);
  const rows = $('[data-testid="session-all-plays"] [data-testid="session-score-row"]').toArray();
  const plays: ParsedPlay[] = [];
  let unreadableCount = 0;

  for (const element of rows) {
    const row = $(element);
    const difficulty = row.find('img.difficulty-bubble').first();
    if (! /\/difficulty\/Phoenix2\//i.test(difficulty.attr('src')  ||  ''))
      continue;

    const score = parseNumber(row.find('[data-testid="peer-score"] p').first().text());
    if (score === null)
      continue;

    const chart = parseChartLabel(difficulty.attr('alt')  ||  '');
    const songTitle = clean(row.find('[data-testid="session-row-chart"]').first().text());
    const songImage = row.find('img').toArray().map((img)  =>  imageName($(img).attr('src'), 'songs')).find(Boolean);
    if (! chart  ||  ! songTitle) {
      unreadableCount++;
      continue;
    }

    const stack = row.find('[data-testid="peer-score"] img').toArray().map((img)  =>  $(img).attr('src'));
    // A broken play's grade image is the grade's with a "_broken" suffix, e.g. "aa_broken".
    const gradeImage = stack.map((src)  =>  imageName(src, 'letters')).find(Boolean)  ??  null;
    const strip = row.find('[data-testid="judgement-strip"]').first();
    const resultStat = (name: string)  =>  parseNumber(strip.find(`.judg-${name}`).first().text());

    plays.push({
      // Two songs may share a title, but not an image.
      songKey: songImage  ||  songTitle,
      songTitle,
      ...chart,
      score,
      grade: gradeImage?.replace(/_broken$/, '')  ??  null,
      passed: ! gradeImage?.endsWith('_broken'),
      plate: stack.map((src)  =>  imageName(src, 'plates')).find(Boolean)  ??  null,
      perfect: resultStat('perfect'),
      great: resultStat('great'),
      good: resultStat('good'),
      bad: resultStat('bad'),
      miss: resultStat('miss'),
      maxCombo: parseNumber(strip.find('.judg-strip-combo').first().text()),
    });
  }

  return { plays, rows: rows.length, unreadable: unreadableCount };
}
