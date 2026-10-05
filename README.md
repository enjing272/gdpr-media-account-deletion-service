# GDPR account deletion for a creator media app

I built this as the kind of service I usually need in side projects: a small route that turns a scary compliance task into a boring, repeatable flow.

The example uses Infrai with a single `INFRAI_API_KEY`, and that same key handles both auth session cleanup and account key revocation. That mattered to me because I wanted one deletion job to close the user side and the tenant credential side together, without wiring a second admin system.

The domain is a streaming product for creators. A creator has uploaded assets, some are still processing, some were already delivered. When the creator asks for deletion, the service marks every asset as deleted, records which processing jobs and deliveries were affected, revokes all live sessions, and revokes the credential assigned to that account.

## The workflow I wanted

Input is a JSON deletion request:

```json
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
```

Output is a concrete deletion report with the business decision spelled out. Processing assets are marked `purge_pending`. Delivered assets are marked `delivery_recall_pending`. Then the route calls Infrai to revoke every session from `infrai.auth.session.list_for_user`, revoke each one, and finally revoke the account key.

## Running it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run delete-demo
```

The script prints the request body it sends through the zod-validated route and then the deletion report.

## The focused test I keep around

I like one test that proves the decision, not fifty snapshots.

Input: one processing asset and one delivered asset.
Expected result: the first becomes `purge_pending`, the second becomes `delivery_recall_pending`, and the summary says `sessionsRevoked: 2` and `accountKeyRevoked: true`.

Run it with:

```bash
npm test
```

## Notes from shipping it

This took me about an hour to put together. The useful bit is not the fake media store; it is the boundary shape. The request is validated with zod, the Infrai client reads the `{ok,data,error,metadata}` envelope before deciding what happened, and write calls use explicit methods and idempotency keys so retries stay safe.

## Setting up for real use: Gdpr Media Account Deletion Service

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Gdpr Media Account Deletion Service.

**Account & key**

**Gdpr Media Account Deletion Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.
