import { Elysia } from 'elysia';
import { normalizeErrorResponse } from '../types/error-response.ts';

function numericStatus(status: number | string | undefined): number | undefined {
  if (typeof status === 'number') return status;
  if (typeof status !== 'string') return undefined;
  const parsed = Number(status);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createErrorResponseMiddleware() {
  return new Elysia({ name: 'error-response-normalizer' }).onAfterHandle({ as: 'global' }, ({ response, set }) => {
    return normalizeErrorResponse(response, numericStatus(set.status));
  });
}
