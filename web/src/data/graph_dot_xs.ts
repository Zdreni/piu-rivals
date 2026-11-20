// Where a scores graph's dots go across it (see ScoresGraph).

export const MAX_SCORE = 1_000_000;
// Few scores aren't spread over the whole width when they're close: neighbouring dots are at most this far apart,
//  in px, per 1000 points between them, but at least MIN_DOT_GAP_PX.
const MAX_PX_PER_THOUSAND_POINTS = 10;
const MIN_DOT_GAP_PX = 6;
// The rivals behind you and those ahead share the width by their counts raised to this power, so the many don't
//  crowd out the few.
const SIDE_SHARE_POWER = 1 / 1.5;

const scoreGapPx = (points: number)  =>  points * MAX_PX_PER_THOUSAND_POINTS / 1000;
const sum = (values: number[])  =>  values.reduce((a, b)  =>  a + b, 0);


// Gaps sharing `widthPx` evenly, each up to its `maxGaps`: what the ones at their max leave goes to the others.
function evenGapsUpTo(maxGaps: number[], widthPx: number): number[] {
  let roomPx = widthPx;
  let leftGapCount = maxGaps.length;
  let level = Infinity;
  for (const maxGap of [...maxGaps].sort((a, b)  =>  a - b)) {
    if (maxGap * leftGapCount > roomPx) {
      level = roomPx / leftGapCount;
      break;
    }

    roomPx -= maxGap;
    leftGapCount--;
  }

  return maxGaps.map((maxGap)  =>  Math.min(maxGap, level));
}


// The x of each of the ascending `scores`' dots, in px from the left of a graph `widthPx` wide; `myIndex` is your
//  score's, or -1. The rivals behind you and those ahead share the width (see SIDE_SHARE_POWER), and are spread evenly
//  in their share, but no farther apart than MAX_PX_PER_THOUSAND_POINTS allows; the room that leaves goes to the
//  others, on the same side first. The right edge stands for a MAX_SCORE result: the highest is as far from it as that
//  allows, in the room the dots leave.
export function dotXs(scores: number[], myIndex: number, widthPx: number): number[] {
  const behindGapCount = Math.max(0, myIndex);
  const aheadGapCount = scores.length - 1 - behindGapCount;
  const behindWeight = behindGapCount ** SIDE_SHARE_POWER;
  const behindWidth = widthPx * behindWeight / (behindWeight + aheadGapCount ** SIDE_SHARE_POWER  ||  1);
  const maxGaps = scores.slice(1).map((score, i)  =>  Math.max(MIN_DOT_GAP_PX, scoreGapPx(score - scores[i]!)));
  const behindMaxGaps = maxGaps.slice(0, behindGapCount);
  const aheadMaxGaps = maxGaps.slice(behindGapCount);
  // A side whose gaps can't fill its share leaves the rest to the other side.
  const behindLeftWidth = behindWidth - sum(evenGapsUpTo(behindMaxGaps, behindWidth));
  const aheadLeftWidth = widthPx - behindWidth - sum(evenGapsUpTo(aheadMaxGaps, widthPx - behindWidth));
  const gaps = [
    ...evenGapsUpTo(behindMaxGaps, behindWidth + aheadLeftWidth),
    ...evenGapsUpTo(aheadMaxGaps, widthPx - behindWidth + behindLeftWidth),
  ];

  const dotsWidth = sum(gaps);
  const maxScoreGap = Math.min(widthPx - dotsWidth, scoreGapPx(MAX_SCORE - scores[scores.length - 1]!));
  return gaps.reduce((xs, gap)  =>  [...xs, xs[xs.length - 1]! + gap], [widthPx - maxScoreGap - dotsWidth]);
}
