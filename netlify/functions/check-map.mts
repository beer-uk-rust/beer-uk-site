// Scheduled function — runs once a day (UTC).
// Logs into the Rust server via WebRcon, reads the live seed + world size,
// and if it has changed since the last run, looks the new map up on
// RustMaps and stores the result in Netlify Blobs for current-map.mts to serve.
//
// IMPORTANT (found 2026-09-03): RustMaps itself warns that Rust's procedural
// generation is not fully deterministic — regenerating a map from the same
// seed + world size can produce a *different* physical map. That means the
// seed/worldsize pair alone is not a safe way to fetch "the" preview image —
// if the server is running from a specific downloaded .map file (server.levelurl
// set), that file's own URL is the only guaranteed-accurate source for the image.
// So this function now reads server.levelurl too and builds the preview image
// directly from it, rather than trusting whatever RustMaps' API returns for a
// fresh seed+worldsize lookup. The API lookup is still used for monuments/land
// stats and the "explore interactively" link (best effort — flagged unverified
// if it doesn't match the levelurl image, since those can legitimately drift).
//
// Required environment variables (set in Netlify site settings, never in code):
//   RCON_HOST          e.g. 198.244.225.11
//   RCON_PORT          e.g. 28017
//   RCON_PASSWORD
//   RUSTMAPS_API_KEY
import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = process.env.RCON_PORT;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const RUSTMAPS_KEY = process.env.RUSTMAPS_API_KEY;

function rconCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`ws://${RCON_HOST}:${RCON_PORT}/${RCON_PASSWORD}`);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(`RCON timed out waiting for "${cmd}"`));
    }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ Identifier: 1, Message: cmd, Name: "WebRcon" }));
    };
    ws.onmessage = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(String(ev.data));
        resolve(String(parsed.Message ?? ""));
      } catch (e) {
        reject(e as Error);
      } finally {
        try { ws.close(); } catch { /* ignore */ }
      }
    };
    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("RCON connection error (check RCON_HOST/PORT/PASSWORD and that the port is open)"));
    };
  });
}

// Rust's console echoes convars back as: server.seed: "50000"
function parseConvar(message: string): string | null {
  const m = message.match(/:\s*"([^"]*)"/);
  return m ? m[1] : null;
}

// server.levelurl looks like:
//   https://maps.rustmaps.com/287/d578e948075c442db6511c4465c5deb4/procedural__3500_LDR-_fAq60yOcwhP_BrAnw.map
// Pull out the {bucket}/{hash} segment so we can build the exact preview image
// for the file the server is actually running — this is immune to RustMaps
// regenerating a "fresh" (and potentially different) map for the same seed.
function parseLevelImageUrl(levelurl: string | null): string | null {
  if (!levelurl) return null;
  const m = levelurl.match(/maps\.rustmaps\.com\/(\d+)\/([0-9a-fA-F]+)\//);
  if (!m) return null;
  return `https://content.rustmaps.com/maps/${m[1]}/${m[2]}/map_raw_normalized.png`;
}

export default async (_req: Request) => {
  if (!RCON_HOST || !RCON_PORT || !RCON_PASSWORD || !RUSTMAPS_KEY) {
    console.error("check-map: missing one of RCON_HOST / RCON_PORT / RCON_PASSWORD / RUSTMAPS_API_KEY env vars");
    return new Response("Missing configuration", { status: 500 });
  }

  const store = getStore("beer-uk-map");

  let seed: string | null, worldsize: string | null, levelurl: string | null;
  try {
    seed = parseConvar(await rconCommand("server.seed"));
    worldsize = parseConvar(await rconCommand("server.worldsize"));
    levelurl = parseConvar(await rconCommand("server.levelurl"));
  } catch (e) {
    console.error("check-map: RCON check failed:", (e as Error).message);
    return new Response("RCON check failed", { status: 502 });
  }

  if (!seed || !worldsize) {
    console.error("check-map: could not parse seed/worldsize from RCON response");
    return new Response("Could not parse RCON response", { status: 502 });
  }

  type MapData = {
    seed: string;
    worldsize: string;
    status: "ready" | "generating";
    imageUrl?: string;
    mapUrl?: string;
    monuments?: number;
    land?: number;
    verified?: boolean;
    updated: string;
  };

  const current = (await store.get("current-map", { type: "json" })) as MapData | null;

  if (current && current.seed === seed && current.worldsize === worldsize && current.status === "ready") {
    console.log(`check-map: no change (seed ${seed}, size ${worldsize})`);
    return new Response("No change");
  }

  console.log(`check-map: seed/size is ${seed}/${worldsize} (previously ${current?.seed}/${current?.worldsize}) — looking up on RustMaps`);

  // The exact image for the .map file the server is actually loading, if we
  // could parse one out of server.levelurl. This is the one guaranteed to be
  // pixel-accurate, regardless of what a fresh RustMaps generation returns.
  const levelImageUrl = parseLevelImageUrl(levelurl);

  const lookupRes = await fetch(
    `https://api.rustmaps.com/v4/maps/${worldsize}/${seed}?staging=false`,
    { headers: { "X-API-Key": RUSTMAPS_KEY } },
  );

  if (lookupRes.status === 404) {
    console.log("check-map: map not generated yet on RustMaps — requesting generation, will pick it up on a future run");
    try {
      await fetch("https://api.rustmaps.com/v4/maps", {
        method: "POST",
        headers: { "X-API-Key": RUSTMAPS_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ size: Number(worldsize), seed: Number(seed), staging: false }),
      });
    } catch (e) {
      console.error("check-map: failed to request generation:", (e as Error).message);
    }
    // Even with no API data yet, if we could read the server's own level file
    // we can still serve an accurate preview image straight away.
    if (levelImageUrl) {
      await store.setJSON("current-map", {
        seed, worldsize, status: "ready", imageUrl: levelImageUrl, verified: true,
        updated: new Date().toISOString(),
      } satisfies MapData);
      return new Response("Generation requested; serving level-file image in the meantime");
    }
    await store.setJSON("current-map", {
      seed, worldsize, status: "generating", updated: new Date().toISOString(),
    } satisfies MapData);
    return new Response("Generation requested");
  }

  if (lookupRes.status === 409) {
    console.log("check-map: map still generating on RustMaps, will check again next run");
    if (levelImageUrl) {
      await store.setJSON("current-map", {
        seed, worldsize, status: "ready", imageUrl: levelImageUrl, verified: true,
        updated: new Date().toISOString(),
      } satisfies MapData);
      return new Response("Still generating on RustMaps; serving level-file image in the meantime");
    }
    await store.setJSON("current-map", {
      seed, worldsize, status: "generating", updated: new Date().toISOString(),
    } satisfies MapData);
    return new Response("Still generating");
  }

  if (!lookupRes.ok) {
    console.error("check-map: RustMaps lookup failed:", lookupRes.status, await lookupRes.text());
    return new Response("RustMaps lookup failed", { status: 502 });
  }

  const body = await lookupRes.json();
  const d = body.data ?? {};

  // RustMaps' own generator can produce a different map from the same seed
  // (their own dashboard warns about this — see comment at the top of this
  // file). Trust the server's own level file for the image whenever we have
  // one; only fall back to the API's image if we couldn't parse a levelurl.
  const apiImageUrl: string | undefined = d.imageUrl;
  const verified = !levelImageUrl || !apiImageUrl || levelImageUrl === apiImageUrl;
  const imageUrl = levelImageUrl ?? apiImageUrl;

  await store.setJSON("current-map", {
    seed,
    worldsize,
    status: "ready",
    imageUrl,
    mapUrl: d.url,
    monuments: d.totalMonuments,
    land: d.landPercentageOfMap,
    verified,
    updated: new Date().toISOString(),
  } satisfies MapData);

  console.log(`check-map: updated — seed ${seed}, size ${worldsize}, monuments ${d.totalMonuments}, verified ${verified}`);
  return new Response("Map updated");
};

export const config: Config = {
  schedule: "@daily",
};
