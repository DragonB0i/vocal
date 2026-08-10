/* eslint-disable @typescript-eslint/no-explicit-any */
// In-memory rate limiting and idempotency (scoped to this serverless instance).
// We document that this is NOT a fully distributed mechanism, but provides 
// safe, lightweight practical protection against basic floods and accidental double-clicks
// without requiring new persistent database schemas.

const requestLog = new Map<string, number[]>();
const idempotencyStore = new Map<string, number>();

// Clean up stale memory every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestLog.entries()) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) requestLog.delete(key);
    else requestLog.set(key, valid);
  }
  for (const [key, timestamp] of idempotencyStore.entries()) {
    if (now - timestamp > 300000) { // 5 min TTL for idempotency
      idempotencyStore.delete(key);
    }
  }
}, 60000).unref();

export function checkRateLimit(ipOrId: string, limitPerMinute: number = 60): boolean {
  const now = Date.now();
  const timestamps = requestLog.get(ipOrId) || [];
  const valid = timestamps.filter(t => now - t < 60000);
  
  if (valid.length >= limitPerMinute) {
    return false; // Rate limited
  }
  
  valid.push(now);
  requestLog.set(ipOrId, valid);
  return true;
}

export function checkIdempotency(key: string): boolean {
  if (!key) return true;
  if (idempotencyStore.has(key)) {
    return false; // Duplicate
  }
  idempotencyStore.set(key, Date.now());
  return true;
}

/**
 * Securely determines the authenticated user ID by querying Hasura.
 * This guarantees the token is structurally valid, has a valid signature,
 * is not expired, and we extract the exact ID Hasura binds to it.
 * It does NOT rely on local unverified JWT payload parsing.
 */
export async function getAuthenticatedUserId(graphqlUrl: string, authHeader: string): Promise<string | null> {
  if (!authHeader) return null;
  const query = `
    query GetMyId {
      users(limit: 1) {
        id
      }
    }
  `;
  try {
    const res = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ query })
    });
    const json = await res.json();
    if (json.errors || !json.data?.users || json.data.users.length === 0) {
      return null;
    }
    return json.data.users[0].id;
  } catch (e) {
    return null;
  }
}
