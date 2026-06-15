import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createCorrelationMiddleware } from '../../../src/middleware/correlation.ts';
import { createErrorMiddleware } from '../../../src/middleware/errors.ts';

const RESPONSE_TIME_RE = /^\d+\.\dms$/;

type TimingEntry = { pathname: string; requestId: string; responseTimeMs: number };

function parseMs(value: string): number {
  return Number(value.replace(/ms$/, ''));
}

function app(entries: TimingEntry[] = []) {
  return new Elysia()
    .use(createCorrelationMiddleware((entry) => entries.push(entry)))
    .use(createErrorMiddleware(() => {}))
    .get('/ok', ({ requestId, store }) => ({
      requestId,
      started: store.requestStartedAtMs > 0,
      responseTimeMs: store.responseTimeMs,
    }))
    .get('/boom', () => {
      throw new Error('boom');
    });
}

async function request(path: string, entries?: TimingEntry[]) {
  const res = await app(entries).handle(new Request(`http://localhost${path}`));
  const body = await res.json() as Record<string, unknown>;
  return { res, body, requestId: res.headers.get('x-request-id') ?? '', timing: res.headers.get('x-response-time') ?? '' };
}

describe('response time header', () => {
  test('adds X-Response-Time to successful responses', async () => {
    const { body, requestId, timing } = await request('/ok');

    expect(timing).toMatch(RESPONSE_TIME_RE);
    expect(parseMs(timing)).toBeGreaterThanOrEqual(0);
    expect(body.requestId).toBe(requestId);
    expect(body.started).toBe(true);
  });

  test('adds X-Response-Time to structured error responses', async () => {
    const { res, body, requestId, timing } = await request('/boom');

    expect(res.status).toBe(500);
    expect(timing).toMatch(RESPONSE_TIME_RE);
    expect(body.correlationId).toBe(requestId);
    expect(body.message).toBe('boom');
  });

  test('adds X-Response-Time to before-handle short-circuited responses', async () => {
    const guarded = new Elysia()
      .use(createCorrelationMiddleware())
      .onBeforeHandle(({ set }) => {
        set.status = 401;
        return { error: 'denied' };
      })
      .get('/private', () => ({ ok: true }));

    const res = await guarded.handle(new Request('http://localhost/private'));
    expect(res.status).toBe(401);
    expect(res.headers.get('x-response-time') ?? '').toMatch(RESPONSE_TIME_RE);
  });

  test('adds X-Response-Time to on-request short-circuited responses', async () => {
    const early = new Elysia()
      .use(createCorrelationMiddleware())
      .onRequest(() => new Response('early', { status: 204 }))
      .get('/early', () => ({ ok: true }));

    const res = await early.handle(new Request('http://localhost/early'));
    expect(res.status).toBe(204);
    expect(res.headers.get('x-response-time') ?? '').toMatch(RESPONSE_TIME_RE);
  });

  test('observes final timing in the after-response hook', async () => {
    const entries: TimingEntry[] = [];
    const { requestId } = await request('/ok', entries);
    await Bun.sleep(0);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pathname: '/ok', requestId });
    expect(entries[0].responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});
