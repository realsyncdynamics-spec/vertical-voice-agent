const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same identity source as the main application's requireUser + memberships.
 * The supplied fetch function is server-side; never expose its configuration
 * as an endpoint that accepts an arbitrary Supabase URL.
 */
export function createSupabaseAuth({ url, anonKey, fetchImpl = fetch }) {
  let base;
  try { base = new URL(url); } catch { throw new TypeError("Invalid Supabase URL"); }
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
      typeof anonKey !== "string" || !anonKey.trim() || typeof fetchImpl !== "function") {
    throw new TypeError("Invalid Supabase configuration");
  }
  const headers = (token) => ({ apikey: anonKey, Authorization: `Bearer ${token}`, Accept: "application/json" });

  return {
    async authenticate({ token, requestedTenantId }) {
      if (typeof token !== "string" || token.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(token) ||
          typeof requestedTenantId !== "string" || !UUID.test(requestedTenantId)) {
        return null;
      }
      const userResponse = await fetchImpl(new URL("/auth/v1/user", base), {
        method: "GET", headers: headers(token), redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (userResponse.status === 401 || userResponse.status === 403) return null;
      if (!userResponse.ok) throw new Error("Supabase user verification unavailable");
      const user = await userResponse.json();
      if (!user || typeof user.id !== "string" || !UUID.test(user.id)) return null;

      const membershipUrl = new URL("/rest/v1/memberships", base);
      membershipUrl.searchParams.set("select", "user_id,tenant_id");
      membershipUrl.searchParams.set("user_id", `eq.${user.id}`);
      membershipUrl.searchParams.set("tenant_id", `eq.${requestedTenantId}`);
      membershipUrl.searchParams.set("limit", "2");
      const membershipResponse = await fetchImpl(membershipUrl, {
        method: "GET", headers: headers(token), redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (membershipResponse.status === 401 || membershipResponse.status === 403) return null;
      if (!membershipResponse.ok) throw new Error("Supabase membership verification unavailable");
      const rows = await membershipResponse.json();
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.user_id !== user.id ||
          rows[0]?.tenant_id !== requestedTenantId) return null;
      return { userId: user.id, tenantId: rows[0].tenant_id };
    },
  };
}
