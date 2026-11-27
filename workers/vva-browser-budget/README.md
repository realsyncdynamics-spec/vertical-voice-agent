# Browser-Budget

Separates browser-session accounting from the telephony budget. This is a
server-side library, not a gateway or a deployed Worker. Apply the migration
only to a **separate** D1 database after explicit approval; no D1 database is
created or migrated by this repository.

An authorized administrator must configure exactly one `browser_budget_global`
row (`id = 1`) and one `browser_budget_tenants` row per tenant. Amounts are
non-negative integer micro-units (one million per currency unit); all rows use
the single configured ISO currency. No prices or limits are provided. The
global limits are per UTC day, per UTC month and per session; tenant limits are
per UTC month and per session. Missing configuration, zero limits, database
errors and a changed currency with existing ledger entries must not authorize
a session. Configuration is trusted server-side data, never browser input.

Before any provider request, the future authenticated gateway must determine
the tenant server-side, calculate a conservative maximum cost from explicitly
configured tariffs and enforceable session limits, and call
`reserveBrowserBudget(browserDb, { sessionId, tenantId, amountMicros })`.
Only `created: true` permits one provider session; retries or any other result
do not. The caller must enforce the reserved cost and close the provider
connection before it can exceed it. This ledger alone cannot enforce provider
usage or guarantee that a tariff estimate is an actual upper bound.

Once final provider usage is authoritative, call `settleBrowserBudget` with
the same tenant and session ID and actual cost in micro-units. Only then can
unused funds become available. An unresolved or failed session remains
reserved; never settle it to zero merely because a connection failed or timed
out. Repeated settlement with a different value is rejected. If final cost
exceeds the reservation, it is recorded accurately and later reservations are
blocked as appropriate, but an overrun cannot be undone. An unresolved
reservation counts in every subsequent UTC day and month. A settled session
counts its entire final amount in every period from reservation to settlement,
conservatively including periods in which no provider usage occurred. Future
ledger dates fail closed. No audio, transcripts, keys or personal conversation
data are stored here.

Run local D1 tests with `npm ci && npm test` in this directory. The module does
not yet implement authentication, provider integration, session timing or
automated reconciliation.

`src/grok-relay.js` contains the adapted Grok socket protocol and a relay
timeout, tested with simulated sockets. It does not create a network connection
or perform admission, and is not connected to the onboarding or a gateway.
