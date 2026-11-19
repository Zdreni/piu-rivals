// Losses are red, from pale, at this share of full red, to full red for this many of them, or for a loss by this many
//  points: a few, or a close one, look light.
const MIN_RED_SHARE = 0.25;
const FULL_RED_LOSS_COUNT = 25;
const FULL_RED_LOSS_POINTS = 10000;


// The red for `fullShare` (0 to 1) of the way to full red, as a CSS percentage of it (see --red-share in the styles).
const redShare = (fullShare: number)  =>
  `${Math.round((MIN_RED_SHARE + (1 - MIN_RED_SHARE) * Math.sqrt(Math.max(0, Math.min(1, fullShare)))) * 100)}%`;


// How red `lossCount` losses are drawn.
export const lossRedShare = (lossCount: number)  =>  redShare((lossCount - 1) / (FULL_RED_LOSS_COUNT - 1));


// How red a loss by `lossPoints` is drawn.
export const lossPointsRedShare = (lossPoints: number)  =>  redShare(lossPoints / FULL_RED_LOSS_POINTS);
