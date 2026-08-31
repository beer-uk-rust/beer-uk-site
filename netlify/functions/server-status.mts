// Public, read-only endpoint the homepage fetches instead of embedding
// BattleMetrics' iframe widget directly. The widget was going blank for
// some visitors (third-party iframes + browser cookie restrictions), and
// separately BattleMetrics' API now requires a paid subscription — so
// player counts come from our own game server instead, via RCON.
//
// This endpoint itself does no RCON work — it just serves whatever
// check-status.mts last wrote to the blob store, so it's fast and cheap
// to hit on every page view (same pattern as current-map.mts).
//
// It always serves the last successful reading, however old — check-status
// retries internally and runs every few minutes, so a stretch of RCON
// trouble just means slightly older numbers here, not a blank "unavailable"
// card. A blank card discourages visitors far more than a number that's a
// bit behind; if the server's genuinely down, "0 players" tells that story
// on its own once a check does succeed.
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (_req: Request) => {
  const store = getStore("beer-uk-status");
  const data = await store.get("current-status", { type: "json" });

  return new Response(JSON.stringify(data ?? {}), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: "/api/server-status",
  method: "GET",
};
