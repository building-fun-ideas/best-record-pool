// Cloudflare Pages Function — runs server-side, so it has no CORS restrictions.
// Fetches each drafted team's current record + points from ESPN's public,
// keyless JSON API and returns one compact JSON object to the page.

const TEAM_IDS = {
  BAL: 33, NYG: 19, CAR: 29, LAR: 14, NO: 18, TEN: 10,
  BUF: 2,  WSH: 28, IND: 11, SEA: 26, DET: 8,  PIT: 23,
  ATL: 1,  PHI: 21, MIN: 16, DEN: 7,  TB: 27,  NE: 17,
  JAX: 30, SF: 25,  GB: 9,   CIN: 4,  CHI: 3,  KC: 12,
  DAL: 6,  LAC: 24, HOU: 34
};

async function fetchTeamRecord(abbr, id) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}`;
  const res = await fetch(url, {
    cf: { cacheTtl: 60, cacheEverything: true },
    headers: {
      // ESPN's endpoints frequently reject requests with no browser-like
      // headers (common from server/edge environments). Send some so we
      // look like an ordinary browser tab.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Referer': 'https://www.espn.com/'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${abbr}`);
  const data = await res.json();
  const items = data?.team?.record?.items || [];
  const total = items.find(i => i.type === 'total');
  if (!total) throw new Error(`No total record field for ${abbr}`);
  const stat = name => total.stats.find(s => s.name === name)?.value ?? 0;
  return {
    w: stat('wins'),
    l: stat('losses'),
    t: stat('ties'),
    pf: stat('pointsFor')
  };
}

export async function onRequestGet(context) {
  const entries = Object.entries(TEAM_IDS);
  const results = await Promise.allSettled(
    entries.map(([abbr, id]) => fetchTeamRecord(abbr, id))
  );

  const standings = {};
  const errors = [];
  results.forEach((result, i) => {
    const [abbr] = entries[i];
    if (result.status === 'fulfilled') {
      standings[abbr] = result.value;
    } else {
      errors.push(abbr + ': ' + result.reason.message);
    }
  });

  const body = JSON.stringify({
    standings,
    updatedAt: new Date().toISOString(),
    errors
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      // Cache at Cloudflare's edge for 2 minutes so a burst of visitors
      // doesn't hammer ESPN — still "refresh the page to update".
      'Cache-Control': 'public, max-age=120, s-maxage=120'
    }
  });
}
