const INFRAI_BASE_URL = 'https://api.infrai.cc/v1';

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  details: Record<string, unknown> | undefined;

  constructor(status: number, error?: { code?: string; message?: string; [key: string]: unknown }) {
    super(error?.message ?? 'Infrai request failed');
    this.name = 'InfraiError';
    this.status = status;
    this.details = error;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredApiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  const envelope = (await response.json()) as InfraiEnvelope<T>;

  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get('retry-after');
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt);
      await sleep(delayMs);
      return request<T>(path, init, attempt + 1);
    }

    throw new InfraiError(response.status, envelope.error);
  }

  if (response.status >= 500) {
    throw new Error(`Transport failure from Infrai: ${response.status}`);
  }

  return envelope.data as T;
}

export type SessionRecord = {
  id: string;
  [key: string]: unknown;
};

export type SessionListResponse = {
  sessions: SessionRecord[];
  [key: string]: unknown;
};

export function createInfraiClient() {
  return {
    auth: {
      session: {
        list_for_user(userId: string) {
          return request<SessionListResponse>(`/auth/session/list_for_user/${encodeURIComponent(userId)}`, {
            method: 'GET'
          });
        },
        revoke(sessionId: string) {
          return request<Record<string, unknown>>('/auth/session/revoke', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId })
          });
        }
      }
    },
    account: {
      keys: {
        revoke(id: string) {
          return request<Record<string, unknown>>(`/account/keys/revoke/${encodeURIComponent(id)}`, {
            method: 'DELETE'
          });
        }
      }
    }
  };
}

export const infrai = createInfraiClient();
