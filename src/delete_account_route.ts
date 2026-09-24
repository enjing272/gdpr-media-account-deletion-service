import { infrai } from './infrai_client';
import { buildDeletionPlan, deletionRequestSchema, type DeletionReport } from './media_retention';

export type SessionGateway = {
  listUserSessions(userId: string): Promise<{ id: string }[]>;
  revokeSession(sessionId: string): Promise<void>;
};

export type AccountKeyGateway = {
  revokeAccountKey(accountKeyId: string): Promise<void>;
};

function makeIdempotencyKey(input: { userId: string; accountKeyId: string; reason: string }): string {
  return `delete:${input.userId}:${input.accountKeyId}:${input.reason}`;
}

export async function handleDeleteAccount(
  body: unknown,
  deps: {
    sessions: SessionGateway;
    accountKeys: AccountKeyGateway;
  }
): Promise<DeletionReport> {
  const request = deletionRequestSchema.parse(body);
  const plan = buildDeletionPlan(request);
  const sessions = await deps.sessions.listUserSessions(request.userId);

  for (const session of sessions) {
    await deps.sessions.revokeSession(session.id);
  }

  const _idempotencyKey = makeIdempotencyKey({
    userId: request.userId,
    accountKeyId: request.accountKeyId,
    reason: request.reason
  });

  await deps.accountKeys.revokeAccountKey(request.accountKeyId);

  return {
    ...plan,
    summary: {
      ...plan.summary,
      sessionsRevoked: sessions.length,
      accountKeyRevoked: true
    }
  };
}

export const liveDependencies = {
  sessions: {
    async listUserSessions(userId: string) {
      const data = await infrai.auth.session.list_for_user(userId);
      return Array.isArray(data.sessions) ? data.sessions.map((session) => ({ id: String(session.id) })) : [];
    },
    async revokeSession(sessionId: string) {
      await infrai.auth.session.revoke(sessionId);
    }
  },
  accountKeys: {
    async revokeAccountKey(accountKeyId: string) {
      await infrai.account.keys.revoke(accountKeyId);
    }
  }
};

async function runDemo(): Promise<void> {
  const requestBody = {
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
  };

  console.log('Deletion request');
  console.log(JSON.stringify(requestBody, null, 2));

  const report = await handleDeleteAccount(requestBody, liveDependencies);

  console.log('Deletion report');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
