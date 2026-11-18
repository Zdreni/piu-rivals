// A score's colour on the Passes page: each grade group's colour at its lowest score, blended between them in OKLCH,
//  which turns the hue round the colour wheel instead of greying it as an RGB average would.
// Gold fades to a warm white short of the maximum: turning to the FPC blue, the hue would pass through green.
const SCORE_COLOR_STOPS: [number, string][] = [
  [0, '#5E6964'],
  [500_000, '#9AA59F'],
  [750_000, '#4FB5A8'],
  [970_000, '#D0703E'],
  [990_000, '#D4BA62'],
  [999_999, '#EEE6CC'],
  [1_000_000, '#CFEFFF'],
];


export function scoreColor(score: number) {
  const hiIndex = SCORE_COLOR_STOPS.findIndex(([stopScore])  =>  score < stopScore);
  const hiStop = SCORE_COLOR_STOPS[hiIndex], loStop = SCORE_COLOR_STOPS[hiIndex - 1];
  if (! hiStop  ||  ! loStop)
    return SCORE_COLOR_STOPS[(hiStop  ?  0  :  SCORE_COLOR_STOPS.length - 1)]![1];

  const [loScore, loColor] = loStop;
  const [hiScore, hiColor] = hiStop;
  const hiShare = (score - loScore) / (hiScore - loScore);
  return `color-mix(in oklch, ${hiColor} ${(hiShare * 100).toFixed(1)}%, ${loColor})`;
}
