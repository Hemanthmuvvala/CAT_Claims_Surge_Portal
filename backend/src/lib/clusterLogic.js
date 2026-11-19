// Deterministic claim clustering — backend port of frontend/src/services/
// clusterLogic.js (peril family + street block). Both sides MUST stay in sync:
// grouping uses (peril family, normalised location key) inside one event, with
// a minimum of 2 claims per cluster (singletons stay ungrouped).

export const PERIL_FAMILIES = {
  flood: { display: "Storm surge / flooding", aliases: ["storm surge", "flood", "surge", "water damage", "inundation"] },
  wind: { display: "Wind damage", aliases: ["wind", "cyclone", "hurricane", "tornado", "typhoon"] },
  hail: { display: "Hail", aliases: ["hail"] },
  fire: { display: "Wildfire", aliases: ["fire", "smoke", "bushfire", "ash"] },
  earthquake: { display: "Earthquake", aliases: ["earthquake", "quake", "tremor", "seismic"] },
  collapse: { display: "Structural collapse", aliases: ["collapse", "structural", "subsidence"] },
};

const ABBREV = { st: "street", rd: "road", ave: "avenue", dr: "drive", hwy: "highway", ln: "lane", ct: "court", blvd: "boulevard", apt: "apartment", fl: "floor" };

export function titleCase(s) {
  return String(s || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizePerilFamily(peril) {
  const p = String(peril || "").trim().toLowerCase();
  if (!p) return { family: "other", display: "Other" };
  for (const [family, def] of Object.entries(PERIL_FAMILIES)) {
    if (def.aliases.some((a) => p.includes(a))) return { family, display: def.display };
  }
  return { family: `raw:${p}`, display: titleCase(p) };
}

export function normalizeLocationKey(location) {
  let s = String(location || "").toLowerCase().trim();
  s = s.replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(unit|apt|flat|suite|ste)\s+\S+\s+/, "");
  s = s.replace(/^\d+[a-z]?\s+/, "");
  s = s.replace(/\b(st|rd|ave|dr|hwy|ln|ct|blvd|apt|fl)\b/g, (m) => ABBREV[m] || m);
  return s;
}

/** Cluster key for a claim-like object: `${perilFamily}||${locationKey}`. */
export function computeClusterKey(claim) {
  const { family } = normalizePerilFamily(claim.peril);
  return `${family}||${normalizeLocationKey(claim.location)}`;
}

export function clusterDisplayName(perilDisplay, location) {
  const block = normalizeLocationKey(location);
  const words = block.split(" ").filter(Boolean);
  const locality = words.length > 2 ? words.slice(-2).join(" ") : block;
  return `${perilDisplay} — ${titleCase(locality)}`;
}

/**
 * Groups claims of ONE event. Claims sharing (peril family, street block) with
 * at least one neighbour form a cluster; singletons stay unclustered (min 2).
 * Returns { clusters, assignment } — assignment is a Map(claimId → clusterId|null).
 */
export function rebuildClustersForEvent(claims) {
  const groups = new Map();
  for (const c of claims) {
    const k = computeClusterKey(c);
    if (!k.split("||")[1]) continue; // no location -> cannot place on a street
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const clusters = [];
  const assignment = new Map();
  for (const [key, members] of groups) {
    if (members.length < 2) {
      members.forEach((c) => assignment.set(c.id, null));
      continue;
    }
    const first = members.find((m) => String(m.location || "").trim()) || members[0];
    const { display } = normalizePerilFamily(first.peril);
    clusters.push({
      key,
      perilFamily: display,
      locationKey: key.split("||")[1],
      peril: display,
      location: String(first.location || "").trim(),
      name: clusterDisplayName(display, first.location),
      note: "Auto-grouped by peril and street block.",
      createdAt: members.map((m) => m.received_at || m.receivedAt).filter(Boolean).sort()[0] || new Date().toISOString(),
    });
    members.forEach((c) => assignment.set(c.id, key));
  }
  return { clusters, assignment };
}
