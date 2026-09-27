import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleRoutesApiError } from '../services/maps';
import { createTripPlan } from '../services/tripPlanning';
import { readJsonBody, sendJson } from '../utils/http';
import { isFinalTripRequest } from '../utils/validation';

export async function handlePlanTrip(
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

  if (!isFinalTripRequest(body)) {
    sendJson(response, 400, { error: 'Request body must be a valid FinalTripRequest.' });
    return;
  }

  try {
    sendJson(response, 200, await createTripPlan(body));
  } catch (error) {
    if (error instanceof GoogleRoutesApiError) {
      sendJson(response, error.statusCode, {
        error: { code: error.code, message: error.message },
      });
      return;
    }
    sendJson(response, 500, { error: { code: 'TRIP_PLAN_FAILED', message: 'Could not plan this trip.' } });
  }
}