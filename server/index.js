import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { getRideQuotes } from './providers/index.js'
import { getPrisma, closePrisma } from './db.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const PLATFORM_FEE = 8
const bookings = new Map()
const otpChallenges = new Map()
const sessions = new Map()
const prisma = getPrisma()
const OTP_TTL_MS = 5 * 60 * 1000

app.use(cors())
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  let database = 'memory'
  if (prisma) {
    try {
      await prisma.$queryRaw`SELECT 1`
      database = 'postgresql'
    } catch {
      database = 'unavailable'
    }
  }
  res.json({ ok: database !== 'unavailable', service: 'rydex-api', platformFee: PLATFORM_FEE, database })
})

app.post('/api/rides/search', async (req, res) => {
  const pickup = String(req.body.pickup || '').trim()
  const destination = String(req.body.destination || '').trim()
  const pickupLat = Number(req.body.pickupLat)
  const pickupLng = Number(req.body.pickupLng)
  const destinationLat = Number(req.body.destinationLat)
  const destinationLng = Number(req.body.destinationLng)

  if (!pickup || !destination) {
    return res.status(400).json({ error: 'Pickup and destination are required.' })
  }

  const hasCoordinates = [pickupLat, pickupLng, destinationLat, destinationLng].every(Number.isFinite)

  const quotes = await getRideQuotes({
    pickup,
    destination,
    coordinates: hasCoordinates
      ? { pickupLat, pickupLng, destinationLat, destinationLng }
      : null,
  })
  res.json({
    pickup,
    destination,
    platformFee: PLATFORM_FEE,
    coordinates: hasCoordinates ? { pickupLat, pickupLng, destinationLat, destinationLng } : null,
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

app.post('/api/auth/request-otp', (req, res) => {
  const normalizedPhone = String(req.body.phone || '').replace(/\s+/g, '')
  if (!/^\\+?[1-9]\\d{9,14}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'Enter a valid mobile number.' })
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  otpChallenges.set(normalizedPhone, { code, expiresAt: Date.now() + OTP_TTL_MS })

  const response = {
    ok: true,
    message: 'OTP generated. Connect an SMS/WhatsApp provider for real delivery.',
    expiresInSeconds: OTP_TTL_MS / 1000,
  }
  if (process.env.OTP_DEMO_MODE === 'true') response.demoCode = code
  res.json(response)
})

app.post('/api/auth/verify-otp', async (req, res) => {
  const normalizedPhone = String(req.body.phone || '').replace(/\s+/g, '')
  const code = String(req.body.code || '').trim()
  const challenge = otpChallenges.get(normalizedPhone)

  if (!/^\\+?[1-9]\\d{9,14}$/.test(normalizedPhone) || !challenge) {
    return res.status(400).json({ error: 'Request a new OTP.' })
  }
  if (Date.now() > challenge.expiresAt) {
    otpChallenges.delete(normalizedPhone)
    return res.status(400).json({ error: 'OTP expired. Request a new one.' })
  }
  if (challenge.code !== code) return res.status(400).json({ error: 'Incorrect OTP.' })

  otpChallenges.delete(normalizedPhone)
  let user = null
  if (prisma) {
    try {
      user = await prisma.user.upsert({
        where: { phone: normalizedPhone },
        update: {},
        create: { phone: normalizedPhone },
      })
    } catch (error) {
      console.error('Database auth failed:', error.message)
      return res.status(503).json({ error: 'Unable to create your account right now.' })
    }
  } else {
    user = { id: `local-${normalizedPhone}`, phone: normalizedPhone, name: null }
  }

  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { userId: user.id, phone: normalizedPhone, createdAt: Date.now() })
  res.json({ ok: true, token, user: { id: user.id, phone: normalizedPhone, name: user.name || null } })
})

app.get('/api/auth/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '')
  const session = sessions.get(token)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })

  if (prisma) {
    try {
      const user = await prisma.user.findUnique({ where: { id: session.userId } })
      if (!user) return res.status(401).json({ error: 'Account not found.' })
      return res.json({ user: { id: user.id, phone: user.phone, name: user.name || null } })
    } catch {
      return res.status(503).json({ error: 'Unable to load account.' })
    }
  }
  res.json({ user: { id: session.userId, phone: session.phone, name: null } })
})

app.post('/api/bookings', async (req, res) => {
  const { pickup, destination, rideId, rideName, fare, phone } = req.body
  const numericFare = Number(fare)
  const normalizedPhone = String(phone || '').replace(/\s+/g, '')

  if (!pickup || !destination || !rideId || !rideName || !Number.isFinite(numericFare)) {
    return res.status(400).json({ error: 'Complete ride details are required.' })
  }

  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'Enter a valid mobile number.' })
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

  if (prisma) {
    try {
      const user = await prisma.user.upsert({
        where: { phone: normalizedPhone },
        update: {},
        create: { phone: normalizedPhone },
      })

      const saved = await prisma.booking.create({
        data: {
          id: booking.id,
          userId: user.id,
          pickup: booking.pickup,
          destination: booking.destination,
          rideType: booking.rideId,
          rideName: booking.rideName,
          fare: booking.fare,
          platformFee: booking.platformFee,
          total: booking.total,
          status: 'PAYMENT_PENDING',
        },
      })
      return res.status(201).json({ ...booking, phone: normalizedPhone, userId: user.id, createdAt: saved.createdAt.toISOString() })
    } catch (error) {
      console.error('Database booking create failed:', error.message)
      return res.status(503).json({ error: 'Booking could not be saved. Please try again.' })
    }
  }

  res.status(201).json({ ...booking, phone: normalizedPhone })
})


app.post('/api/bookings/:id/cancel', async (req, res) => {
  const bookingId = req.params.id

  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return res.status(404).json({ error: 'Booking not found.' })

      if (!['PAYMENT_PENDING', 'CONFIRMED'].includes(booking.status)) {
        return res.status(409).json({ error: 'This booking can no longer be cancelled.' })
      }

      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      })

      bookings.set(bookingId, { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() })
      return res.json(updated)
    } catch (error) {
      console.error('Database booking cancellation failed:', error.message)
      return res.status(503).json({ error: 'Unable to cancel booking.' })
    }
  }

  const booking = bookings.get(bookingId)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })

  if (!['PAYMENT_PENDING', 'CONFIRMED'].includes(booking.status)) {
    return res.status(409).json({ error: 'This booking can no longer be cancelled.' })
  }

  booking.status = 'CANCELLED'
  booking.updatedAt = new Date().toISOString()
  bookings.set(bookingId, booking)
  res.json(booking)
})

app.get('/api/bookings/:id', async (req, res) => {
  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
      if (booking) return res.json({
        ...booking,
        createdAt: booking.createdAt.toISOString(),
        updatedAt: booking.updatedAt.toISOString(),
      })
    } catch (error) {
      console.error('Database booking lookup failed:', error.message)
      return res.status(503).json({ error: 'Unable to load booking.' })
    }
  }

  const booking = bookings.get(req.params.id)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  res.json(booking)
})

const server = app.listen(PORT, () => {
  console.log(`Rydex API running on http://localhost:${PORT}`)
  console.log(`Database: ${prisma ? 'PostgreSQL configured' : 'memory fallback'}`)
})

const shutdown = async () => {
  server.close(async () => {
    await closePrisma()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
