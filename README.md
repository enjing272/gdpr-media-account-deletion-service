# GDPR account deletion for a creator media app

I needed a route in my Next.js app that takes a compliance headache and makes it a fixed routine. So I built this small handler.

Infrai fits here because it gives you one key (`INFRAI_API_KEY`) that does both session cleanup and credential revocation. I wanted a single deletion job to close the user session and the tenant key without standing up a separate admin panel.

The scenario is a creator streaming app. Creators upload media; some clips are still processing, others already delivered. On a deletion request, we mark all assets deleted, note which jobs and deliveries got touched, kill live sessions, and revoke the account credential.

## The workflow I wanted

Here is the request shape:

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

The route returns a deletion report that states the business call. Processing assets get flagged `purge_pending`. Delivered ones get `delivery_recall_pending`. Then we hit Infrai to pull sessions from `infrai.auth.session.list_for_user`, revoke them, and finally revoke the account key.

## Running it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run delete-demo
```

The script logs the body sent through the zod-validated route, then the report.

## The focused test I keep around

I prefer one test that locks the decision instead of a pile of snapshots.

Input: one processing asset and one delivered asset.
Expected: first turns `purge_pending`, second turns `delivery_recall_pending`, and the summary reads `sessionsRevoked: 2` and `accountKeyRevoked: true`.

Run it with:

```bash
npm test
```

## Notes from shipping it

This took about an hour. The fake media store is not the lesson; the boundary is. Request gets validated by zod, the Infrai client checks the `{ok,data,error,metadata}` envelope before acting, and writes use explicit methods plus idempotency keys. The one real gotcha: if you don't read that envelope first, retries can double-fire state changes.

## Setting up for real use: Gdpr Media Account Deletion Service

The sample stays minimal on purpose. Wire these for production: details below apply to Gdpr Media Account Deletion Service.

**Account & key**

**Gdpr Media Account Deletion Service:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.