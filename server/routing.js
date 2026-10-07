const RIDE_RULES = {
  auto: { base: 35, perKm: 18, minimum: 60, speedKph: 24 },
  bike: { base: 25, perKm: 11, minimum: 45, speedKph: 30 },
  cab: { base: 55, perKm: 21, minimum: 90, speedKph: 28 },
  premium: { base: 90, perKm: 30, minimum: 150, speedKph: 26 },
}

function haversineKm(a, b) {
  const toRad = (value) => value * Math.PI / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function fallbackRoute(origin, destination) {
  const straightKm = haversineKm(origin, destination)
  const distanceKm = Math.max(0.5, straightKm * 1.25)
  const durationMin = Math.max(3, Math.ceil((distanceKm / 26) * 60))
  return { distanceKm: Number(distanceKm.toFixed(1)), durationMin, source: 'fallback' }
}

async function getRoute(origin, destination) {
  const fallback = fallbackRoute(origin, destination)
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY
  if (!key) return fallback

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'en-IN',
        units: 'METRIC',
      }),
    })
    const data = await response.json()
    const route = data.routes?.[0]
    if (!response.ok || !route?.distanceMeters || !route?.duration) return fallback
    const seconds = Number.parseInt(String(route.duration).replace('s', ''), 10)
    return {
      distanceKm: Number((route.distanceMeters / 1000).toFixed(1)),
      durationMin: Math.max(1, Math.ceil(seconds / 60)),
      source: 'google',
    }
  } catch {
    return fallback
  }
}

export async function getRouteEstimate({ pickupLat, pickupLng, destinationLat, destinationLng }) {
  const values = [pickupLat, pickupLng, destinationLat, destinationLng].map(Number)
  if (!values.every(Number.isFinite)) return null
  return getRoute(
    { lat: values[0], lng: values[1] },
    { lat: values[2], lng: values[3] },
  )
}

export function calculateFare(rideType, distanceKm) {
  const rule = RIDE_RULES[rideType] || RIDE_RULES.cab
  return Math.max(rule.minimum, Math.round(rule.base + distanceKm * rule.perKm))
}

export function getRideRules() {
  return RIDE_RULES
}
