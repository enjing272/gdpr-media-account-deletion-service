import { z } from 'zod';

export const deliverySchema = z.object({
  deliveryId: z.string().min(1),
  channel: z.string().min(1),
  status: z.enum(['published', 'failed', 'revoked'])
});

export const assetSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['ingested', 'processing', 'delivered']),
  jobIds: z.array(z.string().min(1)),
  deliveries: z.array(deliverySchema)
});

export const deletionRequestSchema = z.object({
  userId: z.string().min(1),
  accountKeyId: z.string().min(1),
  reason: z.enum(['gdpr_erasure', 'self_serve_closure']),
  requestedBy: z.string().min(1),
  assets: z.array(assetSchema).min(1)
});

export type DeletionRequest = z.infer<typeof deletionRequestSchema>;

export type AssetDeletionPlan = {
  assetId: string;
  priorStatus: 'ingested' | 'processing' | 'delivered';
  deletionAction: 'purge_pending' | 'delivery_recall_pending';
  affectedJobs: string[];
  affectedDeliveries: string[];
};

export type DeletionReport = {
  userId: string;
  reason: 'gdpr_erasure' | 'self_serve_closure';
  requestedBy: string;
  assets: AssetDeletionPlan[];
  summary: {
    ingestedAssets: number;
    processingAssets: number;
    deliveredAssets: number;
    sessionsRevoked: number;
    accountKeyRevoked: boolean;
  };
};

export function buildDeletionPlan(input: DeletionRequest): Omit<DeletionReport, 'summary'> & {
  summary: Omit<DeletionReport['summary'], 'sessionsRevoked' | 'accountKeyRevoked'>;
} {
  let ingestedAssets = 0;
  let processingAssets = 0;
  let deliveredAssets = 0;

  const assets = input.assets.map((asset) => {
    if (asset.status === 'ingested') ingestedAssets += 1;
    if (asset.status === 'processing') processingAssets += 1;
    if (asset.status === 'delivered') deliveredAssets += 1;

    return {
      assetId: asset.assetId,
      priorStatus: asset.status,
      deletionAction: asset.status === 'delivered' ? 'delivery_recall_pending' : 'purge_pending',
      affectedJobs: asset.jobIds,
      affectedDeliveries: asset.deliveries.map((delivery) => delivery.deliveryId)
    } satisfies AssetDeletionPlan;
  });

  return {
    userId: input.userId,
    reason: input.reason,
    requestedBy: input.requestedBy,
    assets,
    summary: {
      ingestedAssets,
      processingAssets,
      deliveredAssets
    }
  };
}
