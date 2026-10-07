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

app.post('/api/payments/order', async (req, res) => {
  const { bookingId } = req.body
  const booking = bookings.get(bookingId)

  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Razorpay test credentials are not configured on the server.' })
  }

  try {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: booking.total * 100,
        currency: 'INR',
        receipt: booking.id,
        notes: {
          rydex_booking_id: booking.id,
          ride_type: booking.rideId,
        },
      }),
    })

    const order = await response.json()
    if (!response.ok) {
      return res.status(502).json({ error: order.error?.description || 'Unable to create payment order.' })
    }

    booking.razorpayOrderId = order.id
    booking.status = 'PAYMENT_PENDING'
    bookings.set(booking.id, booking)

    res.json({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId: booking.id,
    })
  } catch {
    res.status(502).json({ error: 'Payment service is temporarily unavailable.' })
  }
})

app.post('/api/payments/verify', (req, res) => {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
  const booking = bookings.get(bookingId)

  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Payment verification is not configured.' })
  if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpayOrderId) {
    return res.status(400).json({ error: 'Payment order does not match this booking.' })
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  const received = String(razorpaySignature || '')
  const valid = received.length === expectedSignature.length && crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(received),
  )

  if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' })

  booking.paymentId = razorpayPaymentId
  booking.status = 'CONFIRMED'
  bookings.set(booking.id, booking)

  res.json({ ok: true, booking })
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
