import type { Env } from '../env';
import { ApiError } from '../errors';
import { getAccessToken } from './auth';

/** Counts documents in a collection group filtered by equality clauses. */
export async function countCollectionGroup(
  env: Env,
  collectionId: string,
  filters: Array<{ field: string; value: string }>,
): Promise<number> {
  const token = await getAccessToken(env);
  const body = {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: {
                field: { fieldPath: f.field },
                op: 'EQUAL',
                value: { stringValue: f.value },
              },
            })),
          },
        },
      },
      aggregations: [{ count: {} }],
    },
  };
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runAggregationQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    console.error('Firestore count failed', res.status, await res.text());
    throw new ApiError('internal', 'Could not check workspace limit.');
  }
  const data = (await res.json()) as Array<{
    result?: Array<{ aggregateFields?: Record<string, { integerValue?: string }> }>;
  }>;
  const count = data[0]?.result?.[0]?.aggregateFields?.count?.integerValue;
  return count ? Number(count) : 0;
}