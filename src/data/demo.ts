import type { TripRequest } from "@/lib/types";
export const demoTripRequest: TripRequest = {
  origin: { address: "FIU Modesto A. Maidique Campus, Miami, FL" },
  destination: { address: "Wynwood Walls, Miami, FL" },
  budgetUsd: 15,
  maxWalkingMinutes: 10,
  hasCar: true,
  preference: "balanced",
  nearbyCategories: ["food"],
};
