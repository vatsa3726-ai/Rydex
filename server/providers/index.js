import { calculateFare, getRideRules } from '../routing.js'

// Provider adapter contract: real partners implement searchQuotes(input).
// Only use mobility APIs that Rydex is authorized to access.
const rideTypes = [
  { id: 'auto', icon: '🛺', name: 'Auto', seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', seats: '1–4' },
]

const demoProviders = [
  { code: 'rydex-partner', name: 'Rydex Partner', multiplier: 1, etaOffset: 0 },
  { code: 'cityride-demo', name: 'CityRide Demo', multiplier: 1.08, etaOffset: 1 },
  { code: 'quickcab-demo', name: 'QuickCab Demo', multiplier: 0.94, etaOffset: 2 },
]

function buildProviderQuotes(provider, { pickup, destination, route }) {
  const distanceKm = route?.distanceKm || 0
  const durationMin = route?.durationMin || 0
  return rideTypes.map((ride) => {
    const rule = getRideRules()[ride.id]
    const baseFare = distanceKm ? calculateFare(ride.id, distanceKm) : rule.minimum
    const fare = Math.max(rule.minimum, Math.round(baseFare * provider.multiplier))
    const pickupEta = Math.max(2, Math.min(15, (Math.ceil(durationMin / 5) || 4) + provider.etaOffset))
    return {
      id: `${provider.code}-${ride.id}`, providerCode: provider.code, provider: provider.name, providerMode: 'demo',
      rideType: ride.id, icon: ride.icon, name: ride.name, seats: ride.seats, eta: pickupEta, pickupEta,
      durationMin, distanceKm, fare, route: { pickup, destination },
    }
  })
}

const adapters = demoProviders.map((provider) => ({ ...provider, async searchQuotes(input) { return buildProviderQuotes(provider, input) } }))

export async function getRideQuotes(input) {
  const results = await Promise.all(adapters.map((adapter) => adapter.searchQuotes(input)))
  return results.flat()
}

export function getProviderCatalog() {
  return adapters.map(({ code, name }) => ({ code, name, mode: 'demo', authorizedIntegrationRequired: true }))
}