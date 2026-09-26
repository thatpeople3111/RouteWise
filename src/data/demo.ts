import type { TripRequest } from "@/lib/types";

/** Example input only; no live service calls or credentials. */
export const demoTripRequest: TripRequest = {
  origin: "Miami, FL",
  destination: "Orlando, FL",
  preferences: { categories: ["food", "coffee"], maxDetourMinutes: 20 },
};
