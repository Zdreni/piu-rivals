// The phone layout in rivals.css, where the levels and the results take turns being the wide panel, and result rows
// unroll on a tap instead of opening their links.
export const PHONE = window.matchMedia('(max-width: 600px)');

// On narrow screens, the panels that wait off the left edge until the levels' top bar slides one in.
export type SidePanel = 'rivals' | 'preferences';
