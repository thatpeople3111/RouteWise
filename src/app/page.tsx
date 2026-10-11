'use client';

import Link from "next/link";
import { useRef, useState } from "react";
import ConstraintsScreen from "@/components/ConstraintsScreen";
import HomeScreen from "@/components/HomeScreen";
import LoadingScreen from "@/components/LoadingScreen";
import RouteResults from "@/components/RouteResults";
import StrandedMode from "@/components/StrandedMode";
import StopPreferences, { type StopPreference, type StopPreferenceSubmission } from "@/components/StopPreferences";
import SuggestedStopCard from "@/components/SuggestedStopCard";
import TripDetailsScreen from "@/components/TripDetailsScreen";
import { DEFAULT_TRIP_DRAFT, draftToTripRequest, type TripDraft } from "@/lib/tripDraft";
import { tripRequestSchema } from "@/lib/validation";
import type { SuggestedStop, TripInput, TripPlan } from "@/lib/types";
import type { SuggestedStopCategory, StopTimeOfDay } from "@/lib/api-types";

import { buildInitialSuggestPreference, planTrip, suggestStops } from "@/lib/api";

type Screen =
  | "HOME"
  | "TRIP_DETAILS"
  | "CONSTRAINTS"
  | "CHECKING_ROUTE"
  | "STOP_OPTIONS"
  | "PLANNING"
  | "RESULTS"
  | "STRANDED";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("HOME");
  const [draft, setDraft] = useState<TripDraft>(DEFAULT_TRIP_DRAFT);
  const [trip, setTrip] = useState<TripInput | null>(null);
  const [stopPreference, setStopPreference] = useState<StopPreference | null>(null);
  const [submittedStopPreference, setSubmittedStopPreference] = useState<StopPreferenceSubmission | null>(null);
  const [selectedStop, setSelectedStop] = useState<SuggestedStop | null>(null);
  const [addedStop, setAddedStop] = useState<SuggestedStop | null>(null);

  const [suggestions, setSuggestions] = useState<SuggestedStop[]>([]);
  const [availableCategories, setAvailableCategories] = useState<SuggestedStopCategory[]>([]);
  const [recommendedCategories, setRecommendedCategories] = useState<SuggestedStopCategory[]>([]);
  const [suggestionTimeOfDay, setSuggestionTimeOfDay] = useState<StopTimeOfDay | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  async function handleTripSubmit(submittedTrip: TripInput) {
    const id = ++requestId.current;
    // Do NOT fetch or render stop businesses yet. Only seed the stop preferences and move to the
    // stop-preference screen; real suggestions load only after the user presses "Find stops".
    const initialPreference = buildInitialSuggestPreference(submittedTrip);
    setTrip(submittedTrip);
    setStopPreference({
      category: initialPreference.category,
      location: initialPreference.timing,
      maxExtraTimeMinutes: initialPreference.maxExtraMinutes ?? null,
      maxExtraSpendingUsd: initialPreference.maxExtraBudget ?? null,
    });
    setSubmittedStopPreference(null);
    setSelectedStop(null);
    setAddedStop(null);
    setSuggestions([]);
    setAvailableCategories([]);
    setRecommendedCategories([]);
    setSuggestionTimeOfDay(null);
    setWarnings([]);
    setError('');
    setPlan(null);
    setBusy(true);
    setScreen('CHECKING_ROUTE');
    try {
      // Lightweight category/availability context only; no business candidates requested here.
      const result = await suggestStops(submittedTrip, { skip: false, category: initialPreference.category, timing: initialPreference.timing, maxExtraMinutes: initialPreference.maxExtraMinutes, maxExtraBudget: initialPreference.maxExtraBudget });
      if (id !== requestId.current) return;
      setAvailableCategories(result.availableCategories);
      setRecommendedCategories(result.recommendedCategories);
      setSuggestionTimeOfDay(result.timeOfDay);
      setScreen('STOP_OPTIONS');
    } catch (failure) {
      if (id !== requestId.current) return;
      console.error('[RouteWise] Stop-preference setup failed.', failure);
      setError(failure instanceof Error ? failure.message : 'Could not check this trip. Please try again.');
      setScreen('STOP_OPTIONS');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  async function startPlanning(stop: SuggestedStop | null = null) {
    if (!trip || busy) return;
    const id = ++requestId.current;
    setBusy(true);
    setError('');
    setScreen('PLANNING');
    try {
      const result = await planTrip(trip, submittedStopPreference, stop);
      if (id !== requestId.current) return;
      setAddedStop(stop);
      setPlan(result);
      setScreen('RESULTS');
    } catch (failure) {
      if (id !== requestId.current) return;
      console.error('[RouteWise] Trip planning request failed.', failure);
      setError(failure instanceof Error ? failure.message : 'Could not plan your trip. Try again.');
      setScreen('STOP_OPTIONS');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  async function handleStopPreferenceSubmit(preference: StopPreferenceSubmission) {
    if (!trip || busy) return;
    setSubmittedStopPreference(preference);
    setSelectedStop(null);
    setAddedStop(null);
    setSuggestions([]);
    setWarnings([]);
    setError('');
    if (preference.skip) { await startPlanning(); return; }
    const id = ++requestId.current;
    setBusy(true);
    try {
      const result = await suggestStops(trip, preference);
      if (id !== requestId.current) return;
      setSuggestions(result.stops);
      setAvailableCategories(result.availableCategories);
      setRecommendedCategories(result.recommendedCategories);
      setSuggestionTimeOfDay(result.timeOfDay);
      setWarnings(result.warnings);
    } catch (failure) {
      if (id !== requestId.current) return;
      console.error('[RouteWise] Stop suggestion request failed.', failure);
      setError(failure instanceof Error ? failure.message : 'Could not find stops. Try again.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  function handleStopPreferenceChange(preference: StopPreference | null) {
    setStopPreference(preference);
    setSubmittedStopPreference(null);
    setSelectedStop(null);
    setSuggestions([]);
    setWarnings([]);
    setError('');
  }

  function handleAddStop(stop: SuggestedStop) { void startPlanning(stop); }
  const matchingStops = suggestions;

  function updateDraft(patch: Partial<TripDraft>) {
    setDraft(current => ({ ...current, ...patch }));
  }

  function startOver() {
    setDraft(DEFAULT_TRIP_DRAFT);
    setTrip(null);
    setStopPreference(null);
    setSubmittedStopPreference(null);
    setSelectedStop(null);
    setAddedStop(null);
    setSuggestions([]);
    setPlan(null);
    setError('');
    setWarnings([]);
    setScreen('HOME');
  }

  function handleLetsGo() {
    setError('');
    try {
      const request = draftToTripRequest(draft);
      const validated = tripRequestSchema.safeParse(request);
      if (!validated.success) {
        setError(validated.error.issues[0].message);
        return;
      }
      void handleTripSubmit(validated.data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Could not prepare your trip. Check the details and try again.');
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="RouteWise home">
            <span className="brand-mark" aria-hidden="true">R</span>
            <span>routewise</span>
          </Link>
          <span className="header-caption"><span className="status-dot" /> A clearer way across town</span>
        </header>
        <section className="intro">
          <div>
            <p className="eyebrow">THE EVERYDAY TRIP PLANNER</p>
            <h1>Make the trip <span>yours.</span></h1>
            <p className="intro-copy">Start where you are. Choose what matters. We’ll find a way there.</p>
          </div>
          <div className="route-stamp" aria-hidden="true">
            <span className="stamp-line" />
            <span className="stamp-pin stamp-start" />
            <span className="stamp-pin stamp-end" />
            <span className="stamp-caption">A → B</span>
          </div>
        </section>
        {screen === "HOME" && (
          <HomeScreen onGetStarted={() => setScreen("TRIP_DETAILS")} onStranded={() => setScreen("STRANDED")} />
        )}
        {screen === "STRANDED" ? (
          <StrandedMode onExit={() => setScreen("HOME")} />
        ) : (
        <div className="planner-layout">
          {error && <p className="form-error" role="alert">{error}</p>}
          {screen === "TRIP_DETAILS" && (
            <TripDetailsScreen
              draft={draft}
              onChange={updateDraft}
              onBack={() => setScreen("HOME")}
              onContinue={() => setScreen("CONSTRAINTS")}
            />
          )}
          {screen === "CONSTRAINTS" && (
            <ConstraintsScreen
              draft={draft}
              onChange={updateDraft}
              onBack={() => setScreen("TRIP_DETAILS")}
              onStart={handleLetsGo}
            />
          )}

          {screen === "CHECKING_ROUTE" && (
            <LoadingScreen
              title="Checking your trip..."
              messages={[
                "Checking your destination",
                "Reviewing your starting point",
                "Checking your schedule and preferences",
              ]}
            />
          )}

          {screen === "STOP_OPTIONS" && (
            <fieldset disabled={busy} className="grid gap-4 min-w-0 border-0 p-0">
              <legend className="sr-only">Optional stops</legend>
              {warnings.map(warning => <p key={warning} role="status">{warning}</p>)}
              <button type="button" className="location-button" onClick={() => { setError(''); setScreen('TRIP_DETAILS'); }}>Edit trip</button>
              {!submittedStopPreference && (
                <StopPreferences
                  value={stopPreference}
                  availableCategories={availableCategories}
                  recommendedCategories={recommendedCategories}
                  timeOfDay={suggestionTimeOfDay}
                  onChange={handleStopPreferenceChange}
                  onSubmit={handleStopPreferenceSubmit}
                />
              )}
              {submittedStopPreference && !submittedStopPreference.skip && (
                <section className="route-results p-5 sm:p-7" aria-labelledby="stop-results-title" aria-live="polite">
                  <div className="results-header">
                    <div>
                      <span className="eyebrow">STOP SUGGESTIONS</span>
                      <h2 id="stop-results-title" className="font-serif text-2xl font-medium text-[#192923]">Stops to consider</h2>
                    </div>
                    <span className="data-mode">Google Places</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#68766f]">
                    Real places and route estimates from Google Maps. Purchase costs may be unavailable.
                  </p>
                  {busy ? (
                    <div className="mt-4" role="status">
                      <LoadingScreen
                        title="Finding good stops…"
                        messages={[
                          "Checking route position",
                          "Finding nearby places",
                          "Comparing detour time",
                          "Applying your limits",
                        ]}
                      />
                    </div>
                  ) : matchingStops.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {matchingStops.map(stop => (
                        <SuggestedStopCard
                          key={stop.id}
                          stop={stop}
                          busy={busy}
                          onAddToTrip={handleAddStop}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 rounded-sm border-l-4 border-[#dce5dc] bg-[#f8faf6] px-3 py-3 text-sm text-[#68766f]">
                      No stops match your current restrictions. Adjust your preferences or continue without a stop.
                    </p>
                  )}
                  <div className="form-footer mt-5 border-t border-[#dce5dc] pt-4">
                    <button type="button" className="location-button" onClick={() => { setSubmittedStopPreference(null); setSuggestions([]); setError(''); }}>
                      Change preferences
                    </button>
                    <span />
                  </div>
                </section>
              )}
            </fieldset>
          )}

          {screen === "PLANNING" && (
            <LoadingScreen
              title="Building your trip..."
              messages={[
                "Checking transportation options",
                "Comparing time and cost",
                "Checking rideshare availability",
                "Checking Waymo service area",
                "Finding useful stops",
                "Choosing the best options",
              ]}
            />
          )}

          {screen === "RESULTS" && trip && plan && (
            <div className="grid gap-4 min-w-0">
              <RouteResults
                plan={plan}
                origin={trip.origin}
                destination={trip.destination}
                selectedStop={addedStop}
                onEditTrip={() => setScreen("TRIP_DETAILS")}
              />
              <button type="button" className="location-button justify-self-start" onClick={startOver}>Start over</button>
            </div>
          )}
        </div>
        )}
        <footer className="page-footer">
          <span>ROUTEWISE</span>
          <span>Plan lightly. Go confidently.</span>
        </footer>
      </div>
    </main>
  );
}
