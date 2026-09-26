import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { tripResponseSchema } from '../shared/contracts.js';
import { DemoProvider } from '../src/providers/demo.js';

const apps: FastifyInstance[] = [];
async function app(env: Record<string, string> = {}, mobility?: DemoProvider) {
  const instance = await buildApp(readConfig(env), { mobility }); apps.push(instance); return instance;
}
const request = { origin: { address: 'FIU MMC, Miami' }, destination: { address: 'Wynwood, Miami' }, hasCar: true, budgetUsd: 15, maxWalkingMinutes: 10 };
afterEach(async () => { await Promise.all(apps.splice(0).map(a => a.close())); });

describe('API contract', () => {
  it('returns schema-valid demo routes and all three card IDs', async () => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload: request });
    expect(response.statusCode).toBe(200);
    const data = tripResponseSchema.parse(response.json());
    expect(data.dataMode).toBe('demo');
    expect(data.best).toBe('demo-drive');
    expect(data.cheapest).toBe('demo-transit');
    expect(data.fastest).toBe('demo-drive');
    expect(data.warnings[0]).toContain('fictional');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('does not request drive or bicycle without ownership', async () => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload: { ...request, hasCar: false } });
    expect(response.json().routes.map((r: { mode: string }) => r.mode)).toEqual(['TRANSIT', 'WALK']);
  });
  it.each([
    { ...request, budgetUsd: -1 }, { ...request, maxWalkingMinutes: '10' },
    { ...request, destination: { latitude: 100, longitude: 0 } },
    { ...request, surprise: true }, { ...request, origin: { address: '   ' } },
    { ...request, origin: { address: 'FIU', latitude: 25, longitude: -80 } },
    { ...request, arrivalTime: '2026-09-26T19:30' },
  ])('rejects malformed requests instead of silently coercing fields', async payload => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
  });
  it('rejects past and out-of-horizon arrival deadlines', async () => {
    const server = await app();
    for (const time of [Date.now() - 60000, Date.now() + 8 * 86400000]) {
      const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload: { ...request, arrivalTime: new Date(time).toISOString() } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_ARRIVAL_TIME');
    }
  });
  it('returns null card IDs when no route meets known limits', async () => {
    const server = await app();
    const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload: { ...request, budgetUsd: 0, maxWalkingMinutes: 0 } });
    expect(response.json()).toMatchObject({ best: null, cheapest: null, fastest: null });
    expect(response.json().routes).toHaveLength(3);
  });
  it('exposes docs, health, and campus presets without secrets', async () => {
    const server = await app({ GEMINI_API_KEY: 'secret-never-return' });
    expect((await server.inject('/docs/')).statusCode).toBe(200);
    const health = await server.inject('/health');
    expect(health.body).not.toContain('secret-never-return');
    expect(health.json().integrations.gemini).toBe('configured_not_verified');
    expect((await server.inject('/api/v1/config')).json().campusPresets).toHaveLength(3);
    expect(server.swagger().paths).toHaveProperty('/api/v1/trips/plan');
  });
  it('supports search and nearby requests; unknown hours never count as open', async () => {
    const server = await app();
    const search = await server.inject({ method: 'POST', url: '/api/v1/places/search', payload: { query: 'Wynwood' } });
    expect(search.json().places).toHaveLength(1);
    const nearby = await server.inject({ method: 'POST', url: '/api/v1/places/nearby', payload: { location: { latitude: 25.8, longitude: -80.2 }, category: 'pharmacy', openNow: true } });
    expect(nearby.json().places).toEqual([]);
  });
  it('restricts browser access to configured origins', async () => {
    const server = await app();
    const allowed = await server.inject({ url: '/health', headers: { origin: 'http://localhost:5173' } });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await server.inject({ url: '/health', headers: { origin: 'https://untrusted.example' } });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('requires the configured access token on all API routes', async () => {
    const server = await app({ API_ACCESS_TOKEN: 'private-server-token' });
    expect((await server.inject('/api/v1/config')).statusCode).toBe(401);
    expect((await server.inject({ url: '/api/v1/config', headers: { authorization: 'Bearer private-server-token' } })).statusCode).toBe(200);
  });
  it('limits requests', async () => {
    const server = await app({ RATE_LIMIT_MAX: '1' });
    expect((await server.inject('/health')).statusCode).toBe(200);
    const limited = await server.inject('/health');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
  });
  it('fails closed in live mode without keys or production access control', () => {
    expect(() => readConfig({ DATA_MODE: 'live' })).toThrow('GOOGLE_MAPS_API_KEY');
    expect(() => readConfig({ DATA_MODE: 'live', GOOGLE_MAPS_API_KEY: 'test', NODE_ENV: 'production' })).toThrow('API_ACCESS_TOKEN');
  });
  it('sanitizes provider failures', async () => {
    const provider = new DemoProvider();
    provider.routes = async () => { throw new Error('secret-token-and-location'); };
    const server = await app({}, provider);
    const response = await server.inject({ method: 'POST', url: '/api/v1/trips/plan', payload: request });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('secret-token-and-location');
  });
});
