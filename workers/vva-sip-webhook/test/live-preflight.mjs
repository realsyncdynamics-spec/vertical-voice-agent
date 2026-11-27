export function validateLiveSmokeHealth(h) {
  if (
    h?.environment !== "test" ||
    h?.telephony_enabled !== false ||
    h?.d1_bound !== true ||
    h?.secrets_configured !== true
  ) {
    throw new Error("Live-Smoke: Sicherheitsabbruch.");
  }
  return h;
}
