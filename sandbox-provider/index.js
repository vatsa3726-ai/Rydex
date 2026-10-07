import express from 'express'

const app = express()
app.use(express.json())

function quote(rideType, distanceKm = 8) {
  const rules = {
    auto: { base: 35, perKm: 18, eta: 4 },
    bike: { base: 25, perKm: 11, eta: 3 },
    cab: { base: 55, perKm: 21, eta: 5 },
    premium: { base: 90, perKm: 30, eta: 7 },
  }
  const rule = rules[rideType]
  const fare = Math.max(rule.base, Math.round(rule.base + distanceKm * rule.perKm))
  return {
    id: `sandbox-${rideType}-${Date.now()}`,
    providerRideId: `SB-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    rideType,
    name: rideType === 'auto' ? 'Auto' : rideType[0].toUpperCase() + rideType.slice(1),
    fare,
    pickupEta: rule.eta,
    durationMin: Math.max(5, Math.round(distanceKm * 3)),
    distanceKm,
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, provider: 'Rydex Sandbox Provider' }))

app.post('/quotes', (req, res) => {
  const distanceKm = Number(req.body?.distanceKm) || 8
  const rideTypes = Array.isArray(req.body?.rideTypes) ? req.body.rideTypes : ['auto', 'bike', 'cab', 'premium']
  res.json({
    provider: 'Rydex Sandbox Provider',
    mode: 'SANDBOX',
    quotes: rideTypes.filter((type) => ['auto', 'bike', 'cab', 'premium'].includes(type)).map((type) => quote(type, distanceKm)),
  })
})

app.listen(process.env.PORT || 4100, () => {
  console.log('Rydex Sandbox Provider API running')
})
