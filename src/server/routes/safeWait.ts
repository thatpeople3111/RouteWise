import type { IncomingMessage, ServerResponse } from 'node:http';
import { GooglePlacesApiError, searchSafeWaitPlaces } from '../services/places';
import { readJsonBody, sendJson } from '../utils/http';

interface SafeWaitRequestBody {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
}

function isSafeWaitRequest(value: unknown): value is SafeWaitRequestBody {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const hasValidCoordinates = typeof record.latitude === 'number' && Number.isFinite(record.latitude)
    && typeof record.longitude === 'number' && Number.isFinite(record.longitude);
  const hasValidRadius = record.radiusMeters === undefined
    || (typeof record.radiusMeters === 'number' && Number.isFinite(record.radiusMeters));
  return hasValidCoordinates && hasValidRadius;
}

export async function handleSafeWait(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: 'Request body must be valid JSON.' });
    return;
  }

  if (!isSafeWaitRequest(body)) {
    sendJson(response, 400, { error: 'Request body must include numeric latitude and longitude.' });
    return;
  }

  try {
    const { best, alternates, warnings } = await searchSafeWaitPlaces(
      { latitude: body.latitude, longitude: body.longitude },
      body.radiusMeters,
    );
    sendJson(response, 200, { dataMode: 'live', best, alternates, warnings });
  } catch (error) {
    if (error instanceof GooglePlacesApiError) {
      sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
      return;
    }
    sendJson(response, 500, { error: { code: 'SAFE_WAIT_SEARCH_FAILED', message: 'Could not search for nearby waiting locations.' } });
  }
}
