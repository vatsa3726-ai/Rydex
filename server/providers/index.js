const demoQuotes = [
  { id: 'auto', icon: '🛺', name: 'Auto', provider: 'Rydex Partner', eta: 4, fare: 180, seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', provider: 'Rydex Partner', eta: 3, fare: 125, seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', provider: 'Rydex Partner', eta: 6, fare: 290, seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', provider: 'Rydex Partner', eta: 8, fare: 420, seats: '1–4' },
]

export async function getRideQuotes({ pickup, destination }) {
  // Provider adapters will be added here as partnerships/API access becomes available.
  // Never scrape another operator's private app or API.
  return demoQuotes.map((quote) => ({
    ...quote,
    route: { pickup, destination },
  }))
}
