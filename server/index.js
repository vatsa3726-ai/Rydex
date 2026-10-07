import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { getRideQuotes } from './providers/index.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const PLATFORM_FEE = 8
const bookings = new Map()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'rydex-api', platformFee: PLATFORM_FEE })
})

app.post('/api/rides/search', async (req, res) => {
  const pickup = String(req.body.pickup || '').trim()
  const destination = String(req.body.destination || '').trim()

  if (!pickup || !destination) {
    return res.status(400).json({ error: 'Pickup and destination are required.' })
  }

  const quotes = await getRideQuotes({ pickup, destination })
  res.json({
    pickup,
    destination,
    platformFee: PLATFORM_FEE,
    rides: quotes.map((ride) => ({
      ...ride,
      total: ride.fare + PLATFORM_FEE,
    })),
  })
})

app.post('/api/bookings', (req, res) => {
  const { pickup, destination, rideId, rideName, fare } = req.body
  const numericFare = Number(fare)

  if (!pickup || !destination || !rideId || !rideName || !Number.isFinite(numericFare)) {
    return res.status(400).json({ error: 'Complete ride details are required.' })
  }

  const booking = {
    id: `RDX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    status: 'PAYMENT_PENDING',
    pickup,
    destination,
    rideId,
    rideName,
    fare: numericFare,
    platformFee: PLATFORM_FEE,
    total: numericFare + PLATFORM_FEE,
    createdAt: new Date().toISOString(),
  }

  bookings.set(booking.id, booking)
  res.status(201).json(booking)
})

app.get('/api/bookings/:id', (req, res) => {
  const booking = bookings.get(req.params.id)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  res.json(booking)
})

app.listen(PORT, () => {
  console.log(`Rydex API running on http://localhost:${PORT}`)
})
