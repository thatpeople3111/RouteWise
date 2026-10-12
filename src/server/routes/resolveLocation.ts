import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendJson } from '../utils/http';
import { resolveUserLocationQuery } from '../services/locationResolution';

export async function handleResolveLocation(request: IncomingMessage, response: ServerResponse) {
  let body;
  try { body = await readJsonBody(request); } catch { sendJson(response, 400, { error: 'Invalid location query.' }); return; }
  if (!body || typeof body !== 'object') { sendJson(response, 400, { error: 'Invalid location query.' }); return; }
  const input = body as { query?: unknown; bias?: { latitude: number; longitude: number } };
  const bias = input.bias;
  if (typeof input.query !== 'string' || input.query.trim().length < 2 || input.query.length > 300
    || (bias !== undefined && (!Number.isFinite(bias?.latitude) || Math.abs(bias.latitude) > 90
      || !Number.isFinite(bias?.longitude) || Math.abs(bias.longitude) > 180))) {
    sendJson(response, 400, { error: 'Enter a valid place query and location.' }); return;
  }
  try { sendJson(response, 200, await resolveUserLocationQuery({ query: input.query, tripOrigin: bias })); }
  catch { sendJson(response, 502, { error: 'Could not load places right now. Try again.' }); }
}
