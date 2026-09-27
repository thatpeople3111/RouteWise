import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDemoSuggestStopsResponse } from '../data/demoStops';
import { getCandidateRoutes } from '../services/maps';
import { searchPlaces, GooglePlacesApiError } from '../services/places';
import { recommendStopCategories } from '../services/categoryRecommendations';
import { filterStopCandidates } from '../services/stopFiltering';
import { readJsonBody, sendJson } from '../utils/http';
import { isSuggestStopsRequest } from '../utils/validation';

export async function handleSuggestStops(
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

  if (!isSuggestStopsRequest(body)) {
    sendJson(response, 400, { error: 'Request body must be a valid stop-suggestion request.' });
    return;
  }

  const recommendations = recommendStopCategories(body);
  if (!body.category || !body.searchArea) {
    sendJson(response, 200, getDemoSuggestStopsResponse(recommendations));
    return;
  }

  try {
    const originalRoutes = await getCandidateRoutes(body);
    const polylineRoute = originalRoutes.find(route => route.encodedPolyline);
    const destination = 'latitude' in body.destination
      ? body.destination
      : originalRoutes.find(route => route.destinationCoordinates)?.destinationCoordinates;

    if (body.searchArea === 'ON_ROUTE' && !polylineRoute?.encodedPolyline) {
      sendJson(response, 200, {
        dataMode: 'live',
        ...recommendations,
        availableCategories: getDemoSuggestStopsResponse(recommendations).availableCategories,
        category: body.category,
        searchArea: body.searchArea,
        stops: [],
        candidates: [],
        warnings: ['No real route geometry was returned, so on-route Places search was unavailable.'],
      });
      return;
    }
    if (body.searchArea === 'DESTINATION' && !destination) {
      sendJson(response, 502, { error: { code: 'DESTINATION_UNRESOLVED', message: 'Google Routes did not return destination coordinates.' } });
      return;
    }

    const placeSearchRequest = body.searchArea === 'ON_ROUTE'
      ? {
        category: body.category,
        searchArea: 'ON_ROUTE' as const,
        routePolyline: polylineRoute!.encodedPolyline!,
        radiusMeters: body.radiusMeters ?? 2000,
        maxResults: body.maxResults ?? 8,
      }
      : {
        category: body.category,
        searchArea: 'DESTINATION' as const,
        destination: destination!,
        radiusMeters: body.radiusMeters ?? 2000,
        maxResults: body.maxResults ?? 8,
      };
    const places = await searchPlaces(placeSearchRequest);
    const filtered = await filterStopCandidates(body, places, {
      maxExtraMinutes: body.maxExtraMinutes,
      maxExtraBudget: body.maxExtraBudget,
      maxWalkingMinutes: body.maxWalkingMinutes,
    }, {
      getOriginalRoutes: async () => originalRoutes,
    });
    const candidates = filtered.accepted
      .sort((first, second) => (second.rating ?? -1) - (first.rating ?? -1)
        || (first.extraStopMinutes ?? Number.POSITIVE_INFINITY)
          - (second.extraStopMinutes ?? Number.POSITIVE_INFINITY))
      .slice(0, 3);
    const warnings: string[] = [];
    if (filtered.rejected.length > 0) warnings.push(`${filtered.rejected.length} place candidates were excluded by the requested restrictions.`);
    if (candidates.some(candidate => candidate.budgetStatus === 'unknown')) {
      warnings.push('Google Places did not provide a numeric purchase estimate; budget suitability is unknown.');
    }

    sendJson(response, 200, {
      dataMode: 'live',
      ...recommendations,
      availableCategories: getDemoSuggestStopsResponse(recommendations).availableCategories,
      category: body.category,
      searchArea: body.searchArea,
      stops: [],
      candidates,
      rejectedCandidates: filtered.rejected,
      warnings,
    });
  } catch (error) {
    if (error instanceof GooglePlacesApiError) {
      sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
      return;
    }
    const apiError = error as { code?: unknown; message?: unknown; statusCode?: unknown };
    const statusCode = typeof apiError.statusCode === 'number' ? apiError.statusCode : 502;
    sendJson(response, statusCode, {
      error: {
        code: typeof apiError.code === 'string' ? apiError.code : 'STOP_SUGGESTION_FAILED',
        message: typeof apiError.message === 'string' ? apiError.message : 'Could not retrieve stop suggestions.',
      },
    });
  }
}