import { describe, expect, it, vi } from 'vitest';
import { tripRequestSchema, type Route } from '../shared/contracts.js';
import { readConfig } from '../src/config.js';
import { evaluate, Planner, type AiProvider } from '../src/planner.js';
import { DemoProvider } from '../src/providers/demo.js';

const input = tripRequestSchema.parse({ origin: { address: 'FIU MMC' }, destination: { address: 'Wynwood' }, hasCar: true });
async function fixture(): Promise<Route> { return (await new DemoProvider().routes(input, 'TRANSIT'))[0]; }
const live = readConfig({ DATA_MODE: 'live', GOOGLE_MAPS_API_KEY: 'test-key' });
describe('route decisions', () => {
  it('does not treat missing or non-USD fares as verified budget matches', async () => {
    const route = await fixture();
    route.cost = { amount: null, currency: 'USD', kind: 'unknown', complete: false, note: '' };
    expect(evaluate(route, input).constraints).toMatchObject({ budget: 'unknown', eligible: false });
    route.cost = { amount: 1, currency: 'EUR', kind: 'provider_fare', complete: true, note: '' };
    expect(evaluate(route, input).constraints.budget).toBe('unknown');
  });
  it('rejects missed deadlines and already departed itineraries', async () => {
    const route = await fixture();
    expect(evaluate(route, { ...input, arrivalTime: new Date(Date.now() + 1000).toISOString() }).constraints.arrival).toBe('missed');
    route.departureTime = new Date(Date.now() - 1000).toISOString();
    expect(evaluate(route, input).constraints.arrival).toBe('missed');
  });
  it('marks unknown walking duration explicitly', async () => {
    const route = await fixture(); route.walkingMinutes = null;
    expect(evaluate(route, input).constraints).toMatchObject({ walking: 'unknown', eligible: false });
  });
  it('keeps surviving routes when one mode fails', async () => {
    const mobility = new DemoProvider(); const original = mobility.routes.bind(mobility);
    mobility.routes = async (request, mode) => { if (mode === 'TRANSIT') throw new Error('offline'); return original(request, mode); };
    const result = await new Planner(live, { mobility, ai: null }).plan(input);
    expect(result.best).toBe('demo-drive'); expect(result.warnings.join(' ')).toContain('TRANSIT provider request failed');
    expect(result.dataMode).toBe('live');
  });
  it('rejects invented AI route IDs and falls back without losing route facts', async () => {
    const ai: AiProvider = { choose: vi.fn().mockResolvedValue({ routeId: 'invented-route', reasonCode: 'balanced' }), groundedPlaces: vi.fn() };
    const result = await new Planner(live, { mobility: new DemoProvider(), ai }).plan(input);
    expect(result.recommendation.source).toBe('rules'); expect(result.best).toBe('demo-drive');
    expect(result.warnings.join(' ')).toContain('AI recommendation unavailable');
  });
  it('allows a valid AI selection without editing fares or duration', async () => {
    const ai: AiProvider = { choose: vi.fn().mockResolvedValue({ routeId: 'demo-transit', reasonCode: 'balanced' }), groundedPlaces: vi.fn() };
    const result = await new Planner(live, { mobility: new DemoProvider(), ai }).plan(input);
    expect(result.best).toBe('demo-transit'); expect(result.recommendation.source).toBe('gemini');
    expect(result.routes.find(r => r.id === result.best)?.cost.amount).toBe(5.5);
  });
  it('does not let AI override an explicit cheapest preference', async () => {
    const ai: AiProvider = { choose: vi.fn().mockResolvedValue({ routeId: 'demo-drive', reasonCode: 'balanced' }), groundedPlaces: vi.fn() };
    const result = await new Planner(live, { mobility: new DemoProvider(), ai }).plan({ ...input, preference: 'cheapest' });
    expect(result.best).toBe('demo-transit'); expect(result.recommendation.source).toBe('rules');
  });
  it('never calls Gemini in normal demo mode, even with a configured key', async () => {
    const result = await new Planner(readConfig({ GEMINI_API_KEY: 'not-a-real-key' })).plan(input);
    expect(result.recommendation.source).toBe('rules');
  });
  it('returns a provisional result when all costs are unknown; cheapest remains null', async () => {
    const route = await fixture(); route.cost.amount = null; route.cost.complete = false;
    const mobility = new DemoProvider(); mobility.routes = async (_, mode) => mode === 'TRANSIT' ? [route] : [];
    const result = await new Planner(live, { mobility, ai: null }).plan(input);
    expect(result.best).toBe(route.id); expect(result.cheapest).toBeNull();
    expect(result.recommendation.reason).toContain('Provisional');
  });
  it('keeps empty results distinct from provider errors', async () => {
    const mobility = new DemoProvider(); mobility.routes = async () => [];
    const result = await new Planner(live, { mobility, ai: null }).plan(input);
    expect(result.routes).toEqual([]); expect(result.best).toBeNull();
  });
  it('degrades gracefully when nearby places fail', async () => {
    const mobility = new DemoProvider(); mobility.nearby = async () => { throw new Error('offline'); };
    const result = await new Planner(live, { mobility, ai: null }).plan({ ...input, nearbyCategories: ['food'] });
    expect(result.best).not.toBeNull(); expect(result.nearby).toEqual([]);
    expect(result.warnings).toContain('A nearby-place category was unavailable.');
  });
});
