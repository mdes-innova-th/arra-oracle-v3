import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createErrorResponseMiddleware } from '../../../src/middleware/error-response.ts';

describe('route error response normalizer', () => {
  test('adds the shared error shape to route-level error objects', async () => {
    const app = new Elysia()
      .use(createErrorResponseMiddleware())
      .get('/missing-q', ({ set }) => {
        set.status = 400;
        return { error: 'Missing query parameter: q' };
      });

    const res = await app.handle(new Request('http://local/missing-q'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Missing query parameter: q',
      code: 400,
    });
  });

  test('does not alter successful responses', async () => {
    const app = new Elysia()
      .use(createErrorResponseMiddleware())
      .get('/ok', () => ({ ok: true }));

    const res = await app.handle(new Request('http://local/ok'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
