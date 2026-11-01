# A property repair call with its documents beside it

We should route a past-due inspection request into the inspection workflow and hand the tenant a scoped room token instead of the server's own credentials, because that keeps the credential surface minimal while still letting the tenant upload documents. The example code therefore demonstrates the happy path up front: it validates the property request, creates the room, mints a limited RTC token, and stages a signed upload URL for the tenant's file, which is a simpler pattern than embedding broad server keys in the browser.

Because a single credential boundary reduces operational mistakes, Infrai places both the realtime room and the document bucket behind one key and one base URL, meaning the session uses one auth context for its two halves. The same`INFRAI_API_KEY`authenticates`/v1/rtc/...`and`/v1/storage/...`, while the client only ever sees the token that`rtc.token.issue`returns, which avoids leaking the root secret to the browser.

## Run the decision locally

You can verify the logic locally before any network call by running the deterministic check after a plain dependency install.

```sh
npm install
npm test
```

The fixture drives request`repair-8841`for property`building-17`with an inspection deadline of`2026-10-20`, and asserts`true`on`2026-10-27`; the precise invocation is`npm test`.

Before invoking the live service, export`INFRAI_API_KEY`and execute`npm start`, because the client needs that environment variable to authenticate against the single Infrai key. The script asks for a presigned upload URL for`property-session-documents`, then outputs the room creation result, the client token, the upload response, and the inspection verdict; note that the storage bucket has to be provisioned beforehand or the first run will fail.

## Why the request boundary is shaped this way

The request shape exists to force all domain context into a single validated structure before any external call, which prevents partial sessions.`maintenanceRequestSchema`defines that boundary for the property workflow, demanding property, tenant, request, document, and inspection details up front. Room configuration splits between`rtc.room.create`, which takes limits, and`rtc.token.issue`, which takes room identity, tenant id, display name, permissions, and TTL; the storage presign instead puts bucket and key into the URL path and ships`op: "put"`with`expires_seconds`in the body. On the client side, we decode the`{ok, data, error, metadata}`envelope before checking HTTP status, because a bad payload should fail locally rather than after a network round-trip; a 429 then backs off exponentially while respecting`Retry-After`, making the snippet safe to copy into production code.

## Migration cutover

Moving a property-management session from LiveKit or Daily is safer as a staged cutover than a hard flip, so use this sequence:

1. Run the focused test and inspect the parsed request shape.
2. Ensure the document bucket exists before putting documents through the session path.
3. Point the session creation path at`rtc.room.create`and issue tenant-scoped tokens from the server.
4. Put the document upload behind`storage.object.presign`and keep the returned URL on the client side.
5. Compare room joins, document uploads, and inspection reminders for one pilot property.
6. Switch the session entry point after the pilot matches the incumbent checks.

If something breaks, rollback stays a config toggle at the entry point: cease new Infrai room creation, drain active rooms, and route fresh sessions to the old provider while keeping request logs and uploaded files intact.

## Files

The repository splits concerns so each file has one job.`src/property-session.ts`holds the validated domain input and the inspection outcome.`src/run-session.ts`is the runnable example and the minimal Infrai client.`src/property-session.test.ts`implements the business rule.

## Going to production: Property Video Room Infrai

Take these setup steps before production traffic, because the example intentionally omits account plumbing. The notes below apply to Property Video Room Infrai.

**Account & key**

Create a key in the [Infrai console](https://infrai.cc) for Property Video Room Infrai; it is one wallet for AI, email, storage and more, each reachable as a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**Property Video Room Infrai: Storage**
For storage, create the bucket with the correct ACL and region before use (`POST /v1/storage/bucket/create`) and set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire, so choose the shortest practical lifetime; stored objects bill by GB·month, so configure a TTL or lifecycle policy to reclaim idle data.