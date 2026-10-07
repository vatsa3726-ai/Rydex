import { calculateFare, getRideRules } from '../routing.js'
import { decryptSecret, validateProviderUrl } from '../security.js'

export const rideTypes = [
  { id: 'auto', icon: '🛺', name: 'Auto', seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', seats: '1–4' },
]

const demoProviders = [
  { code: 'rydex-partner', name: 'Rydex Partner', multiplier: 1, etaOffset: 0, bookingUrl: null },
  { code: 'cityride-demo', name: 'CityRide Demo', multiplier: 1.08, etaOffset: 1, bookingUrl: null },
  { code: 'quickcab-demo', name: 'QuickCab Demo', multiplier: 0.94, etaOffset: 2, bookingUrl: null },
]

function buildDemoQuotes(provider, input) {
  const distanceKm = input.route?.distanceKm || 0
  const durationMin = input.route?.durationMin || 0

  return rideTypes
    .filter((ride) => !provider.rideTypes?.length || provider.rideTypes.includes(ride.id))
    .map((ride) => {
      const rule = getRideRules()[ride.id]
      const baseFare = distanceKm ? calculateFare(ride.id, distanceKm) : rule.minimum
      const fare = Math.max(rule.minimum, Math.round(baseFare * (provider.multiplier || 1)))
      const pickupEta = Math.max(2, Math.min(15, (Math.ceil(durationMin / 5) || 4) + (provider.etaOffset || 0)))

      return {
        id: `${provider.code}-${ride.id}`,
        providerCode: provider.code,
        provider: provider.name,
        providerMode: 'demo',
        quoteSource: 'SANDBOX',
        isLive: false,
        rideType: ride.id,
        icon: ride.icon,
        name: ride.name,
        seats: ride.seats,
        eta: pickupEta,
        pickupEta,
        durationMin,
        distanceKm,
        fare,
        bookingUrl: provider.bookingUrl || null,
        route: { pickup: input.pickup, destination: input.destination },
      }
    })
}

function normalizeProviderQuote(raw, provider, input) {
  if (!raw || typeof raw !== 'object') return null
  const rideType = String(raw.rideType || raw.type || '').toLowerCase()
  const allowed = rideTypes.find((ride) => ride.id === rideType)
  if (!allowed) return null

  const fare = Number(raw.fare)
  const eta = Number(raw.pickupEta ?? raw.eta)
  if (!Number.isFinite(fare) || fare < 0 || !Number.isFinite(eta) || eta < 0) return null

  return {
    id: String(raw.id || `${provider.code}-${rideType}-${Date.now()}`),
    providerCode: provider.code,
    provider: provider.name,
    providerMode: 'api',
    quoteSource: 'LIVE',
    isLive: true,
    rideType,
    icon: allowed.icon,
    name: raw.name || allowed.name,
    seats: raw.seats || allowed.seats,
    eta,
    pickupEta: eta,
    durationMin: Number(raw.durationMin ?? input.route?.durationMin ?? 0),
    distanceKm: Number(raw.distanceKm ?? input.route?.distanceKm ?? 0),
    fare: Math.round(fare),
    bookingUrl: raw.bookingUrl || provider.bookingUrl || null,
    providerRideId: raw.providerRideId ? String(raw.providerRideId) : null,
    route: { pickup: input.pickup, destination: input.destination },
  }
}

function createDemoAdapter(provider) {
  return {
    ...provider,
    async testConnection() {
      return { ok: true, status: 'SANDBOX', message: 'Demo provider is available in sandbox mode.' }
    },
    async searchQuotes(input) {
      return buildDemoQuotes(provider, input)
    },
  }
}

function createApiAdapter(provider) {
  const connection = provider.connection
  return {
    ...provider,
    async testConnection() {
      if (!connection?.apiBaseUrl) return { ok: false, status: 'NOT_CONFIGURED', message: 'API base URL is not configured.' }
      validateProviderUrl(connection.apiBaseUrl)
      const response = await fetch(connection.apiBaseUrl, {
        method: 'GET',
        headers: buildAuthHeaders(connection),
        signal: AbortSignal.timeout(8000),
      })
      return { ok: response.ok, status: response.ok ? 'CONNECTED' : 'ERROR', httpStatus: response.status }
    },
    async searchQuotes(input) {
      if (!connection?.apiBaseUrl) return []
      const endpoint = validateProviderUrl(connection.apiBaseUrl)
      endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/quotes'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { ...buildAuthHeaders(connection), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          pickup: input.pickup,
          destination: input.destination,
          distanceKm: input.route?.distanceKm || 0,
          coordinates: input.coordinates || null,
          rideTypes: input.rideTypes || rideTypes.map((ride) => ride.id),
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error(`Provider quote API returned HTTP ${response.status}.`)
      const body = await response.text()
      if (body.length > 1_000_000) throw new Error('Provider quote response is too large.')
      let payload
      try { payload = JSON.parse(body) } catch { throw new Error('Provider quote response must be valid JSON.') }
      const quotes = Array.isArray(payload) ? payload : payload.quotes
      if (!Array.isArray(quotes)) throw new Error('Provider quote response must contain a quotes array.')
      return quotes.map((quote) => normalizeProviderQuote(quote, provider, input)).filter(Boolean)
    },
  }
}

function buildAuthHeaders(connection) {
  const headers = { Accept: 'application/json' }
  if (connection.apiKey) headers['X-API-Key'] = decryptSecret(connection.apiKey)
  if (connection.apiSecret) headers['X-API-Secret'] = decryptSecret(connection.apiSecret)
  return headers
}

function createConfiguredAdapter(provider) {
  const type = String(provider.integrationType || 'DEMO').toUpperCase()

  if (type === 'API' && provider.liveApproved && provider.connection?.status === 'CONNECTED') {
    return createApiAdapter(provider)
  }

  if (type === 'BOOKING_LINK') {
    return {
      ...provider,
      async searchQuotes() {
        return []
      },
    }
  }

  return createDemoAdapter({
    ...provider,
    multiplier: 1,
    etaOffset: 0,
  })
}

export function getProviderAdapter(providerCode, providerList = []) {
  const provider = providerList.find((item) => item.code === providerCode)
  return provider ? createConfiguredAdapter(provider) : demoProviders.find((item) => item.code === providerCode) ? createDemoAdapter(demoProviders.find((item) => item.code === providerCode)) : null
}

export async function getRideQuotes(input, configuredProviders = null) {
  const source = configuredProviders !== null ? configuredProviders : demoProviders
  const results = await Promise.allSettled(source.map(async (provider) => {
    const adapter = createConfiguredAdapter(provider)
    const quotes = await adapter.searchQuotes(input)
    return quotes.map((quote) => normalizeProviderQuote(quote, provider, input)).filter(Boolean)
  }))
  return results.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value)
}

export function getProviderCatalog(providerList = null) {
  const source = providerList?.length ? providerList : demoProviders
  return source.map((provider) => ({
    code: provider.code,
    name: provider.name,
    mode: String(provider.integrationType || 'DEMO').toLowerCase(),
    bookingUrl: provider.bookingUrl || null,
    authorizedIntegrationRequired: provider.integrationType !== 'DEMO',
    liveQuotesEnabled: String(provider.integrationType || 'DEMO').toUpperCase() === 'API' && provider.liveApproved === true && provider.connection?.status === 'CONNECTED',
  }))
}
