// Pure boundary for an authorized website-profile response. No network or activation.
const FIELDS = new Set(["business_name", "industry", "services", "opening_hours", "public_contact", "faq"]);
function publicOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password || u.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    if (/\.(localhost|local|internal|home\.arpa)$/i.test(u.hostname)) return null;
    return u.origin;
  } catch { return null; }
}
function sameSiteSource(source, expected) {
  const candidate = publicOrigin(source);
  if (!candidate) return false;
  const a = new URL(expected), b = new URL(candidate);
  const bare = h => h.startsWith("www.") ? h.slice(4) : h;
  return bare(a.hostname) === bare(b.hostname) && !(a.protocol === "https:" && b.protocol !== "https:");
}
const bounded = (v, max) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function validateProfile(payload, expectedOrigin) {
  const origin = publicOrigin(expectedOrigin);
  if (!origin || expectedOrigin !== origin || !payload || payload.status !== "ok" || payload.source_origin !== origin ||
      !bounded(payload.observed_at, 40) || !Number.isFinite(Date.parse(payload.observed_at)) ||
      !Array.isArray(payload.candidates) || payload.candidates.length > 40) return null;
  const candidates = [];
  for (const c of payload.candidates) {
    if (!c || !FIELDS.has(c.field) || !bounded(c.value, 2000) || !bounded(c.evidence, 1000) ||
        !bounded(c.source_url, 2048) || !sameSiteSource(c.source_url, origin)) return null;
    const source = new URL(c.source_url);
    source.search = ""; source.hash = "";
    candidates.push(Object.freeze({field:c.field,value:c.value.trim(),source_url:source.href,evidence:c.evidence.trim()}));
  }
  return Object.freeze({source_origin:origin,observed_at:payload.observed_at,candidates:Object.freeze(candidates)});
}
// Only confirmed business names can currently be mapped to an existing wizard field.
// Contact found on a website is not an emergency handoff contact. Other fields require dedicated UI.
export function confirmedBusinessName(profile, index, confirmed) {
  if (confirmed !== true || !Number.isInteger(index) || !profile || !Array.isArray(profile.candidates)) return null;
  const c = profile.candidates[index];
  return c?.field === "business_name" && bounded(c.value, 200) ? c.value : null;
}
