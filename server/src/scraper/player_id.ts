const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;


// Accepts a player GUID or any piuscores link containing one, e.g. ".../Player/<guid>/Sessions".
export function parsePlayerId(value: string): string | null {
  return value.match(GUID_RE)?.[0].toLowerCase()  ??  null;
}
