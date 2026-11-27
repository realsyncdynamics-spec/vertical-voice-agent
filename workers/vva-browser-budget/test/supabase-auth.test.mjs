import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupabaseAuth } from "../src/supabase-auth.js";

const userId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const foreignTenant = "33333333-3333-4333-8333-333333333333";
const user = () => Response.json({ id: userId });
const rows = (items) => Response.json(items);
const make = (fetchImpl) => createSupabaseAuth({ url: "https://example.supabase.co", anonKey: "test-anon", fetchImpl });

test("validates the token with Supabase and checks user-scoped membership", async () => {
  const seen = [];
  const auth = make(async (url, init) => {
    seen.push({ url: new URL(url), init });
    return seen.length === 1 ? user() : rows([{ user_id: userId, tenant_id: tenantId }]);
  });
  assert.deepEqual(await auth.authenticate({ token: "test.jwt.value", requestedTenantId: tenantId }), { userId, tenantId });
  assert.equal(seen[0].url.pathname, "/auth/v1/user");
  assert.equal(seen[1].url.pathname, "/rest/v1/memberships");
  assert.equal(seen[1].url.searchParams.get("user_id"), `eq.${userId}`);
  assert.equal(seen[1].url.searchParams.get("tenant_id"), `eq.${tenantId}`);
  for (const call of seen) {
    assert.equal(call.init.headers.Authorization, "Bearer test.jwt.value");
    assert.equal(call.init.headers.apikey, "test-anon");
    assert.equal(call.init.redirect, "error");
  }
});

test("rejects invalid credentials, foreign membership and ambiguous membership", async () => {
  let calls = 0;
  const reject = make(async () => { calls++; return new Response(null, { status: 401 }); });
  assert.equal(await reject.authenticate({ token: "bad", requestedTenantId: tenantId }), null);
  assert.equal(calls, 1);
  assert.equal(await reject.authenticate({ token: "", requestedTenantId: tenantId }), null);
  assert.equal(await reject.authenticate({ token: "token", requestedTenantId: "not-a-uuid" }), null);
  for (const members of [[], [{ user_id: userId, tenant_id: foreignTenant }],
    [{ user_id: userId, tenant_id: tenantId }, { user_id: userId, tenant_id: tenantId }]]) {
    let n = 0;
    const auth = make(async () => ++n === 1 ? user() : rows(members));
    assert.equal(await auth.authenticate({ token: "token", requestedTenantId: tenantId }), null);
  }
});

test("configuration and backend failures do not produce an identity", async () => {
  assert.throws(() => createSupabaseAuth({ url: "http://example.test", anonKey: "key" }), TypeError);
  assert.throws(() => createSupabaseAuth({ url: "https://example.test", anonKey: "" }), TypeError);
  const auth = make(async () => new Response(null, { status: 503 }));
  await assert.rejects(() => auth.authenticate({ token: "token", requestedTenantId: tenantId }),
    /verification unavailable/);
});
