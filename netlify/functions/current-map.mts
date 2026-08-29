// Public, read-only endpoint the site's front end fetches from map.html.
// Just serves whatever check-map.mts last wrote to the blob store — no
// RCON or RustMaps calls happen on this path, so it's fast and cheap to hit
// on every page view.
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (_req: Request) => {
  const store = getStore("beer-uk-map");
  const data = await store.get("current-map", { type: "json" });

  return new Response(JSON.stringify(data ?? {}), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: "/api/current-map",
  method: "GET",
};
