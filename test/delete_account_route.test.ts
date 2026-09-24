import { describe, expect, it } from 'vitest';
import { handleDeleteAccount } from '../src/delete_account_route';

describe('handleDeleteAccount', () => {
  it('marks media for purge or recall, revokes all sessions, and revokes the account key', async () => {
    const revokedSessions: string[] = [];
    const revokedKeys: string[] = [];

    const report = await handleDeleteAccount(
      {
        userId: 'user_123',
        accountKeyId: 'key_789',
        reason: 'gdpr_erasure',
        requestedBy: 'dpo@studio.test',
        assets: [
          {
            assetId: 'asset_raw_1',
            title: 'Episode 1',
            status: 'processing',
            jobIds: ['job_transcode_1'],
            deliveries: []
          },
          {
            assetId: 'asset_ready_2',
            title: 'Trailer',
            status: 'delivered',
            jobIds: ['job_thumb_9'],
            deliveries: [
              {
                deliveryId: 'delivery_22',
                channel: 'cdn',
                status: 'published'
              }
            ]
          }
        ]
      },
      {
        sessions: {
          async listUserSessions() {
            return [{ id: 'sess_1' }, { id: 'sess_2' }];
          },
          async revokeSession(sessionId: string) {
            revokedSessions.push(sessionId);
          }
        },
        accountKeys: {
          async revokeAccountKey(accountKeyId: string) {
            revokedKeys.push(accountKeyId);
          }
        }
      }
    );

    expect(report.assets).toEqual([
      {
        assetId: 'asset_raw_1',
        priorStatus: 'processing',
        deletionAction: 'purge_pending',
        affectedJobs: ['job_transcode_1'],
        affectedDeliveries: []
      },
      {
        assetId: 'asset_ready_2',
        priorStatus: 'delivered',
        deletionAction: 'delivery_recall_pending',
        affectedJobs: ['job_thumb_9'],
        affectedDeliveries: ['delivery_22']
      }
    ]);
    expect(report.summary).toEqual({
      ingestedAssets: 0,
      processingAssets: 1,
      deliveredAssets: 1,
      sessionsRevoked: 2,
      accountKeyRevoked: true
    });
    expect(revokedSessions).toEqual(['sess_1', 'sess_2']);
    expect(revokedKeys).toEqual(['key_789']);
  });
});
