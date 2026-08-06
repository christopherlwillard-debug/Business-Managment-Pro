/**
 * VehicleEngine — the single source of truth for all vehicle operating-cost calculations.
 *
 * Takes a route (miles) and a vehicle profile and returns operating costs.
 * This is the ONLY place `distance / mpg × fuelPrice` may be computed.
 *
 * Rules 53 and 54 of the Architecture Constitution:
 *   - The VehicleEngine owns: fuel gallons, fuel cost, and future costs
 *     (wear, maintenance, CO₂ — stub fields reserved for future use).
 *   - No caller may compute `distance / mpg × fuelPrice` independently.
 *   - The VehicleEngine does NOT call RoutingEngine — it receives miles
 *     from the caller so routing and cost concerns stay separated.
 */

export interface VehicleProfile {
  /** Average fuel economy in miles per gallon. */
  avgMpg: number;
  /** Fuel price in dollars per gallon. */
  fuelPricePerGallon: number;
}

export interface OperatingCostInput {
  /** One-way driving distance in miles (from RoutingEngine.calculate). */
  onewayMiles: number;
  /** Number of job work-days (round trips). Minimum 1. */
  daysOnJob: number;
  /** Vehicle profile to use for cost calculations. */
  vehicleProfile: VehicleProfile;
}

export interface OperatingCostResult {
  /** Round-trip miles per day (onewayMiles × 2). */
  roundTripMiles: number;
  /** Total driven miles across all days (roundTripMiles × daysOnJob). */
  totalMiles: number;
  /** Total fuel consumed in gallons (totalMiles / avgMpg). */
  fuelGallons: number;
  /** Estimated fuel cost in dollars (fuelGallons × fuelPricePerGallon). */
  fuelCost: number;
  // Future fields (not yet calculated — reserved for Rule 54 compliance):
  // wearCost: number | null;
  // maintenanceCost: number | null;
  // co2Kg: number | null;
}

export const VehicleEngine = {
  /**
   * Compute vehicle operating costs for a job.
   *
   * Formula:
   *   roundTripMiles = onewayMiles × 2
   *   totalMiles     = roundTripMiles × daysOnJob
   *   fuelGallons    = totalMiles / avgMpg
   *   fuelCost       = fuelGallons × fuelPricePerGallon
   */
  operatingCost({
    onewayMiles,
    daysOnJob,
    vehicleProfile,
  }: OperatingCostInput): OperatingCostResult {
    const { avgMpg, fuelPricePerGallon } = vehicleProfile;

    const roundTripMiles = parseFloat((onewayMiles * 2).toFixed(1));
    const totalMiles = parseFloat((roundTripMiles * daysOnJob).toFixed(1));
    const fuelGallons = parseFloat((totalMiles / avgMpg).toFixed(3));
    const fuelCost = parseFloat((fuelGallons * fuelPricePerGallon).toFixed(2));

    return { roundTripMiles, totalMiles, fuelGallons, fuelCost };
  },
};
