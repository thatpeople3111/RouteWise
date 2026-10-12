import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDemoSuggestStopsResponse } from '../data/demoStops';
import { getCandidateRoutes, getDirectDriveRoute } from '../services/maps';
import { dedupeClusteredPlaces, pickSpreadOnRouteStops, searchPlaces, GooglePlacesApiError } from '../services/places';
import { recommendStopCategories } from '../services/categoryRecommendations';
import { filterStopCandidates } from '../services/stopFiltering';
import { readJsonBody, sendJson } from '../utils/http';
import { isSuggestStopsRequest } from '../utils/validation';
import { resolveTripLocations } from '../services/locationResolution';
import { determineTripScope } from '../services/tripScope';

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
    let trip = await resolveTripLocations(body);
    let originalRoutes = await getCandidateRoutes(trip);
    const originPoint = originalRoutes.find(route => route.originCoordinates)?.originCoordinates ?? ('latitude' in trip.origin ? trip.origin : null);
    const destinationPoint = originalRoutes.find(route => route.destinationCoordinates)?.destinationCoordinates ?? ('latitude' in trip.destination ? trip.destination : null);
    const scopeDrive = originalRoutes.find(route => route.travelMode === 'DRIVE');
    const longDistance = !trip.notes?.startsWith('RouteWise Stranded mode request')
      && determineTripScope(originPoint, destinationPoint, scopeDrive?.distanceMeters, scopeDrive ? scopeDrive.durationSeconds / 60 : undefined) === 'LONG_DISTANCE';
    if (longDistance) {
      trip = { ...trip, hasCar: true, allowTransit: false, allowWalking: false };
      const drive = scopeDrive ?? await getDirectDriveRoute(trip);
      originalRoutes = drive ? [drive] : [];
    }
    const polylineRoute = originalRoutes.find(route => route.encodedPolyline);
    const destination = 'latitude' in body.destination
      ? body.destination
      : originalRoutes.find(route => route.destinationCoordinates)?.destinationCoordinates;

    if (body.searchArea === 'ON_ROUTE' && !polylineRoute?.encodedPolyline) {
      sendJson(response, 502, { error: 'Route geometry could not be loaded for this stop search. Try again.' });
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
        radiusMeters: body.radiusMeters,
        maxResults: body.maxResults ?? 12,
      }
      : {
        category: body.category,
        searchArea: 'DESTINATION' as const,
        destination: destination!,
        radiusMeters: body.radiusMeters,
        maxResults: body.maxResults ?? 12,
      };
    let places = dedupeClusteredPlaces(await searchPlaces(placeSearchRequest));
    const initialPool = body.searchArea === 'ON_ROUTE' ? pickSpreadOnRouteStops(places, polylineRoute!.encodedPolyline!, 24) : places.slice(0, 24);
    let filtered = await filterStopCandidates(trip, initialPool, {
      maxExtraMinutes: body.maxExtraMinutes,
      maxExtraBudget: body.maxExtraBudget,
      maxWalkingMinutes: body.maxWalkingMinutes,
    }, {
      getOriginalRoutes: async () => originalRoutes,
    });
    const initialAccepted = filtered.accepted.length;
    let broadSearchFailed = false;
    if (initialAccepted < 4) {
      try {
        const newPlaces = dedupeClusteredPlaces(await searchPlaces(placeSearchRequest, { broaden: true }))
          .filter(place => !places.some(existing => existing.placeId === place.placeId));
        const untested = [...places.filter(place => !initialPool.some(existing => existing.placeId === place.placeId)), ...newPlaces];
        const broader = body.searchArea === 'ON_ROUTE' ? pickSpreadOnRouteStops(untested, polylineRoute!.encodedPolyline!, 24) : untested.slice(0, 24);
        const additional = await filterStopCandidates(trip, broader, {
          maxExtraMinutes: body.maxExtraMinutes, maxExtraBudget: body.maxExtraBudget, maxWalkingMinutes: body.maxWalkingMinutes,
        }, { getOriginalRoutes: async () => originalRoutes });
        places = [...places, ...broader];
        filtered = { accepted: [...filtered.accepted, ...additional.accepted], rejected: [...filtered.rejected, ...additional.rejected],
          serviceFailures: (filtered.serviceFailures ?? 0) + (additional.serviceFailures ?? 0) };
      } catch (failure) {
        if (initialAccepted === 0) throw failure;
        broadSearchFailed = true;
      }
    }
    if (filtered.accepted.length === 0 && filtered.serviceFailures) {
      sendJson(response, 502, { error: 'We could not verify routes to these stops right now. Try again.' }); return;
    }
    const sorted = filtered.accepted
      .sort((first, second) => (second.rating ?? -1) - (first.rating ?? -1)
        || (first.extraStopMinutes ?? Number.POSITIVE_INFINITY)
          - (second.extraStopMinutes ?? Number.POSITIVE_INFINITY));
    // On-route: keep a geographically spread set; destination: keep the top-rated cluster.
    const candidates = body.searchArea === 'ON_ROUTE' && polylineRoute?.encodedPolyline
      ? pickSpreadOnRouteStops(sorted, polylineRoute.encodedPolyline, 4)
      : sorted.slice(0, 4);
    const warnings: string[] = [];
    if (longDistance) warnings.push('For this longer trip, roadway stops apply to the Driving option only.');
    if (broadSearchFailed) warnings.push('Additional stop searching is unavailable; these verified stops remain available.');
    if (process.env.NODE_ENV === 'development') console.debug('[RouteWise stop filters]', {
      category: body.category, afterDedupe: places.length, initialAccepted, afterUserConstraints: filtered.accepted.length,
      finalReturned: candidates.length, rejectedBy: filtered.rejected.reduce<Record<string, number>>((counts, candidate) => {
        for (const reason of candidate.rejectionReasons) counts[reason] = (counts[reason] ?? 0) + 1;
        return counts;
      }, {}),
    });
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
