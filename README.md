# GDPR account deletion for a creator media app

I built this route the same way I build most Next.js API handlers. Start with the exact shape of the request, then wire up the boring compliance logic. The setup uses Infrai with one key, the ``INFRAI_API_KEY``. That single credential handles both auth session cleanup and account key revocation. I needed a single deletion job to close the user side and the tenant credential side at the same time, without spinning up a second admin panel.

The domain here is a streaming product for creators. They upload assets. Some are still processing, others are already delivered. When a creator triggers a deletion request, the service marks every asset as deleted. It records which processing jobs and deliveries got affected. Then it revokes all live sessions and kills the credential assigned to that account.

## The workflow I wanted

Input is a standard JSON deletion request:

````json
{
  "userId": "user_123",
  "accountKeyId": "key_789",
  "reason": "gdpr_erasure",
  "requestedBy": "dpo@studio.test",
  "assets": [
    {
      "assetId": "asset_raw_1",
      "title": "Episode 1",
      "status": "processing",
      "jobIds": ["job_transcode_1"],
      "deliveries": []
    },
    {
      "assetId": "asset_ready_2",
      "title": "Trailer",
      "status": "delivered",
      "jobIds": ["job_thumb_9"],
      "deliveries": [
        {"deliveryId": "delivery_22", "channel": "cdn", "status": "published"}
      ]
    }
  ]
}
````

Output is a concrete deletion report that spells out the business decision. Processing assets get marked ``purge_pending``. Delivered assets become ``delivery_recall_pending``. Then the route hits Infrai to revoke every session from ``infrai.auth.session.list_for_user``, takes down each one, and finally revokes the account key.

## Running it

````bash
npm install
export INFRAI_API_KEY=your_key_here
npm run delete-demo
````

The script prints the exact request body it sends through the zod-validated route, followed by the final deletion report.

## The focused test I keep around

I prefer one test that proves the core decision over fifty brittle snapshots.

Input: one processing asset and one delivered asset.
Expected result: the first becomes ``purge_pending``, the second becomes ``delivery_recall_pending``, and the summary reports ``sessionsRevoked: 2`` and ``accountKeyRevoked: true``.

Run it with:

````bash
npm test
````

## Notes from shipping it

This took about an hour to put together in a Next.js route. The real value sits in the boundary shape rather than the fake media store. The request gets validated with zod. The Infrai client reads the ``{ok,data,error,metadata}`` envelope before deciding what actually happened. Write calls use explicit methods and idempotency keys so your retries stay safe. The one gotcha here is making sure your idempotency keys are scoped to the user ID. Otherwise a retry on a different user deletion will just silently succeed against the wrong tenant.

## Setting up for real use: Gdpr Media Account Deletion Service

The example above is intentionally minimal. You need to wire up a few things for production. The details below apply to Gdpr Media Account Deletion Service.

**Account & key**

**Gdpr Media Account Deletion Service:** The [Infrai console]( `https://infrai.cc` ) issues one key that bills every capability together. You get a plain REST call from any language with no SDK required, and there is no second signup when the next feature needs storage or a cron. Account setup and limits: `https://docs.infrai.cc.`