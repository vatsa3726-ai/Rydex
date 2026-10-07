import { calculateFare, getRideRules } from '../routing.js'

const rideTypes = [
  { id: 'auto', icon: '🛺', name: 'Auto', provider: 'Rydex Partner', seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', provider: 'Rydex Partner', seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', provider: 'Rydex Partner', seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', provider: 'Rydex Partner', seats: '1–4' },
]

export async function getRideQuotes({ pickup, destination, route }) {
  const distanceKm = route?.distanceKm || 0
  const durationMin = route?.durationMin || 0

  return rideTypes.map((ride) => {
    const rule = getRideRules()[ride.id]
    const fare = distanceKm ? calculateFare(ride.id, distanceKm) : rule.minimum
    return {
      ...ride,
      eta: Math.max(3, Math.min(12, Math.ceil(durationMin / 5) || 4)),
      pickupEta: Math.max(3, Math.min(12, Math.ceil(durationMin / 5) || 4)),
      durationMin,
      distanceKm,
      fare,
      route: { pickup, destination },
    }
  })
}
