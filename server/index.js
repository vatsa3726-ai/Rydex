import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getRideQuotes, getProviderCatalog } from './providers/index.js'
import { getRouteEstimate } from './routing.js'
import { getPrisma, closePrisma } from './db.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const PLATFORM_FEE = 8
const bookings = new Map()
const otpChallenges = new Map()
const sessions = new Map()
const drivers = new Map()
const prisma = getPrisma()
const OTP_TTL_MS = 5 * 60 * 1000
const requestCounters = new Map()
const RATE_WINDOW_MS = 15 * 60 * 1000
const OTP_MAX_REQUESTS = 5

function allowRateLimit(key, max = OTP_MAX_REQUESTS) {
  const now = Date.now()
  const existing = requestCounters.get(key)
  if (!existing || now - existing.startedAt > RATE_WINDOW_MS) {
    requestCounters.set(key, { startedAt: now, count: 1 })
    return true
  }
  if (existing.count >= max) return false
  existing.count += 1
  requestCounters.set(key, existing)
  return true
}

function getSession(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  return sessions.get(token) || null
}

async function findBooking(bookingId) {
  if (prisma) return prisma.booking.findUnique({ where: { id: bookingId } })
  return bookings.get(bookingId) || null
}

async function savePaymentOrder(bookingId, order) {
  if (prisma) {
    return prisma.payment.upsert({
      where: { bookingId },
      update: { gateway: 'razorpay', gatewayOrderId: order.id, amount: order.amount, currency: order.currency, status: 'created' },
      create: { bookingId, gateway: 'razorpay', gatewayOrderId: order.id, amount: order.amount, currency: order.currency, status: 'created' },
    })
  }
  return null
}

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',').map((item) => item.trim()) : true,
}))
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return res.status(503).json({ error: 'Webhook secret is not configured.' })
  const signature = String(req.headers['x-razorpay-signature'] || '')
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex')
  if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(400).json({ error: 'Invalid webhook signature.' })
  }

  try {
    const payload = JSON.parse(req.body.toString('utf8'))
    const event = String(payload.event || '')
    const paymentEntity = payload.payload?.payment?.entity
    const orderId = paymentEntity?.order_id
    const paymentId = paymentEntity?.id

    if (prisma && orderId) {
      const payment = await prisma.payment.findFirst({ where: { gatewayOrderId: orderId } })
      if (payment) {
        const paid = event === 'payment.captured' || event === 'order.paid'
        const failed = event === 'payment.failed'
        if (paid) {
          await prisma.$transaction([
            prisma.payment.update({ where: { id: payment.id }, data: { gatewayPaymentId: paymentId || payment.gatewayPaymentId, status: 'paid' } }),
            prisma.booking.update({ where: { id: payment.bookingId }, data: { paymentId: paymentId || undefined, status: 'CONFIRMED' } }),
          ])
        } else if (failed) {
          await prisma.payment.update({ where: { id: payment.id }, data: { gatewayPaymentId: paymentId || undefined, status: 'failed' } })
        }
      }
    }
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Invalid webhook payload.' })
  }
})
app.use(express.json({ limit: '1mb' }))

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

app.post('/api/analytics/events', async (req, res) => {
  const allowed = new Set(['SEARCH', 'RESULTS_SHOWN', 'PROVIDER_SELECTED', 'HANDOFF'])
  const eventType = String(req.body?.eventType || '').toUpperCase()
  if (!allowed.has(eventType)) return res.status(400).json({ error: 'Invalid analytics event.' })

  const clean = (value, max = 180) => {
    const text = String(value ?? '').trim()
    return text ? text.slice(0, max) : null
  }
  const data = {
    eventType,
    providerCode: clean(req.body?.providerCode, 80),
    rideType: clean(req.body?.rideType, 40),
    pickup: clean(req.body?.pickup),
    destination: clean(req.body?.destination),
    city: clean(req.body?.city, 100),
    sessionKey: clean(req.body?.sessionKey, 120),
    metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
  }
  if (prisma) {
    try { await prisma.analyticsEvent.create({ data }) } catch (error) { console.error('Analytics event failed:', error.message) }
  }
  res.status(202).json({ ok: true })
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

  const route = hasCoordinates
    ? await getRouteEstimate({ pickupLat, pickupLng, destinationLat, destinationLng })
    : null

  let configuredProviders = null
  if (prisma) {
    try {
      configuredProviders = await prisma.provider.findMany({
        where: { active: true },
        select: { code: true, name: true, integrationType: true, bookingUrl: true, cities: true, rideTypes: true, connection: { select: { apiBaseUrl: true, apiKey: true, apiSecret: true, status: true } } },
        orderBy: { name: 'asc' },
      })
    } catch {}
  }

  const quotes = await getRideQuotes({
    pickup,
    destination,
    route,
    coordinates: hasCoordinates
      ? { pickupLat, pickupLng, destinationLat, destinationLng }
      : null,
  }, configuredProviders?.length ? configuredProviders : null)
  res.json({
    pickup,
    destination,
    platformFee: 0,
    coordinates: hasCoordinates ? { pickupLat, pickupLng, destinationLat, destinationLng } : null,
    route,
    rides: quotes.map((ride) => ({
      ...ride,
      total: ride.fare,
    })),
  })
})

app.get('/api/providers/catalog', async (_req, res) => {
  if (!prisma) return res.json({ providers: getProviderCatalog(), source: 'adapter-registry' })
  try {
    const providers = await prisma.provider.findMany({
      where: { active: true },
      select: { code: true, name: true, integrationType: true, bookingUrl: true, cities: true, rideTypes: true },
      orderBy: { name: 'asc' },
    })
    res.json({ providers: providers.length ? providers : getProviderCatalog(), source: providers.length ? 'database' : 'adapter-registry' })
  } catch {
    res.json({ providers: getProviderCatalog(), source: 'adapter-registry' })
  }
})

app.post('/api/payments/order', async (req, res) => {
  const { bookingId } = req.body
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })

  const booking = await findBooking(bookingId)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (prisma && booking.userId !== session.userId) return res.status(403).json({ error: 'You cannot pay for this booking.' })
  if (!prisma && booking.phone !== session.phone) return res.status(403).json({ error: 'You cannot pay for this booking.' })
  if (booking.status !== 'PAYMENT_PENDING') return res.status(409).json({ error: 'Booking is not awaiting payment.' })
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Razorpay test credentials are not configured on the server.' })
  }

  try {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: booking.total * 100,
        currency: 'INR',
        receipt: booking.id,
        notes: { rydex_booking_id: booking.id, ride_type: booking.rideType || booking.rideId },
      }),
    })
    const order = await response.json()
    if (!response.ok) return res.status(502).json({ error: order.error?.description || 'Unable to create payment order.' })

    if (prisma) {
      await savePaymentOrder(booking.id, order)
    } else {
      booking.razorpayOrderId = order.id
      bookings.set(booking.id, booking)
    }

    res.json({ keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, bookingId: booking.id })
  } catch {
    res.status(502).json({ error: 'Payment service is temporarily unavailable.' })
  }
})

app.post('/api/payments/verify', async (req, res) => {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })

  const booking = await findBooking(bookingId)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (prisma && booking.userId !== session.userId) return res.status(403).json({ error: 'You cannot verify this booking.' })
  if (!prisma && booking.phone !== session.phone) return res.status(403).json({ error: 'You cannot verify this booking.' })
  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Payment verification is not configured.' })

  let storedOrderId = booking.razorpayOrderId
  if (prisma) {
    const payment = await prisma.payment.findUnique({ where: { bookingId } })
    storedOrderId = payment?.gatewayOrderId
  }
  if (!storedOrderId || storedOrderId !== razorpayOrderId) return res.status(400).json({ error: 'Payment order does not match this booking.' })

  const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex')
  const received = String(razorpaySignature || '')
  const valid = received.length === expectedSignature.length && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(received))
  if (!valid) return res.status(400).json({ error: 'Payment signature verification failed.' })

  if (prisma) {
    const updated = await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { paymentId: razorpayPaymentId, status: 'CONFIRMED' } }),
      prisma.payment.update({ where: { bookingId }, data: { gatewayPaymentId: razorpayPaymentId, status: 'paid' } }),
    ])
    return res.json({ ok: true, booking: updated[0] })
  }

  booking.paymentId = razorpayPaymentId
  booking.status = 'CONFIRMED'
  bookings.set(booking.id, booking)
  res.json({ ok: true, booking })
})

app.use('/api/providers', (req, res, next) => {
  const expected = process.env.PROVIDER_API_TOKEN
  if (!expected) return next()
  if (String(req.headers['x-provider-token'] || '') !== expected) return res.status(401).json({ error: 'Provider access denied.' })
  next()
})

app.get('/api/providers/earnings', async (req, res) => {
  const providerCode = String(req.query.providerCode || '').trim()
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = req.query.to ? new Date(String(req.query.to)) : new Date()
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid date range.' })

  if (prisma) {
    try {
      const provider = providerCode ? await prisma.provider.findUnique({ where: { code: providerCode } }) : null
      if (providerCode && !provider) return res.status(404).json({ error: 'Provider not found.' })
      const completed = await prisma.booking.findMany({
        where: { status: 'COMPLETED', createdAt: { gte: from, lte: to }, ...(provider ? { providerId: provider.id } : {}) },
        select: { fare: true, platformFee: true, total: true, createdAt: true, rideType: true },
      })
      const fare = completed.reduce((sum, item) => sum + item.fare, 0)
      const platformFees = completed.reduce((sum, item) => sum + item.platformFee, 0)
      const total = completed.reduce((sum, item) => sum + item.total, 0)
      return res.json({ from, to, rides: completed.length, fare, platformFees, totalCollected: total, providerEarnings: fare, rydexRevenue: platformFees })
    } catch (error) {
      console.error('Provider earnings failed:', error.message)
      return res.status(503).json({ error: 'Unable to load earnings.' })
    }
  }

  const completed = [...bookings.values()].filter((item) => item.status === 'COMPLETED')
  const fare = completed.reduce((sum, item) => sum + Number(item.fare || 0), 0)
  const platformFees = completed.reduce((sum, item) => sum + Number(item.platformFee || PLATFORM_FEE), 0)
  return res.json({ from, to, rides: completed.length, fare, platformFees, totalCollected: fare + platformFees, providerEarnings: fare, rydexRevenue: platformFees })
})

app.post('/api/partners/apply', async (req, res) => {
  const { companyName, contactName, email, phone, website, cities = [], rideTypes = [], integrationType = 'BOOKING_LINK', notes = '' } = req.body || {}
  if (!String(companyName || '').trim() || !String(contactName || '').trim() || !String(email || '').trim()) {
    return res.status(400).json({ error: 'Company name, contact name and email are required.' })
  }
  if (!prisma) return res.status(503).json({ error: 'Partner applications require the database.' })
  try {
    const application = await prisma.partnerApplication.create({
      data: { companyName: String(companyName).trim(), contactName: String(contactName).trim(), email: String(email).trim().toLowerCase(), phone: phone || null, website: website || null, cities, rideTypes, integrationType, notes: notes || null },
    })
    res.status(201).json({ application: { id: application.id, status: application.status } })
  } catch {
    res.status(500).json({ error: 'Unable to submit partner application.' })
  }
})

app.get('/api/admin/partner-applications', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.json({ applications: [] })
  const applications = await prisma.partnerApplication.findMany({ orderBy: { createdAt: 'desc' } })
  res.json({ applications })
})

app.patch('/api/admin/partner-applications/:id', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.status(503).json({ error: 'Database is required.' })
  const status = String(req.body?.status || '').toUpperCase()
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) return res.status(400).json({ error: 'Invalid application status.' })
  const application = await prisma.partnerApplication.update({ where: { id: req.params.id }, data: { status } })
  let provider = null
  if (status === 'APPROVED') {
    const baseCode = application.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'provider'
    let code = baseCode
    let suffix = 2
    while (await prisma.provider.findUnique({ where: { code } })) code = `${baseCode}-${suffix++}`
    provider = await prisma.provider.create({
      data: {
        name: application.companyName,
        code,
        active: false,
        integrationType: application.integrationType,
        cities: application.cities,
        rideTypes: application.rideTypes,
        bookingUrl: null,
      },
    })
    await prisma.partnerApplication.update({ where: { id: application.id }, data: { providerCode: provider.code } })
  }
  res.json({ application, provider })
})

app.get('/api/admin/providers/:code/connection', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.json({ connection: null })
  const provider = await prisma.provider.findUnique({
    where: { code: req.params.code },
    include: { connection: true },
  })
  if (!provider) return res.status(404).json({ error: 'Provider not found.' })
  const connection = provider.connection
  res.json({
    connection: connection ? {
      id: connection.id,
      apiBaseUrl: connection.apiBaseUrl,
      apiKeyConfigured: Boolean(connection.apiKey),
      apiSecretConfigured: Boolean(connection.apiSecret),
      status: connection.status,
      lastTestedAt: connection.lastTestedAt,
      lastError: connection.lastError,
    } : null,
  })
})

app.put('/api/admin/providers/:code/connection', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.status(503).json({ error: 'Database is required.' })
  const provider = await prisma.provider.findUnique({ where: { code: req.params.code } })
  if (!provider) return res.status(404).json({ error: 'Provider not found.' })

  const current = await prisma.providerConnection.findUnique({ where: { providerId: provider.id } })
  const data = {
    apiBaseUrl: req.body?.apiBaseUrl ? String(req.body.apiBaseUrl).trim() : null,
    apiKey: req.body?.apiKey ? String(req.body.apiKey).trim() : current?.apiKey || null,
    apiSecret: req.body?.apiSecret ? String(req.body.apiSecret).trim() : current?.apiSecret || null,
    status: 'CONFIGURED',
    lastError: null,
  }
  const connection = await prisma.providerConnection.upsert({
    where: { providerId: provider.id },
    update: data,
    create: { providerId: provider.id, ...data },
  })
  res.json({ connection: { apiBaseUrl: connection.apiBaseUrl, apiKeyConfigured: Boolean(connection.apiKey), apiSecretConfigured: Boolean(connection.apiSecret), status: connection.status } })
})

app.post('/api/admin/providers/:code/connection/test', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.status(503).json({ error: 'Database is required.' })
  const provider = await prisma.provider.findUnique({ where: { code: req.params.code }, include: { connection: true } })
  if (!provider) return res.status(404).json({ error: 'Provider not found.' })
  if (!provider.connection?.apiBaseUrl) return res.status(400).json({ error: 'API base URL is not configured.' })

  const startedAt = Date.now()
  try {
    const response = await fetch(provider.connection.apiBaseUrl, { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    const status = response.ok ? 'CONNECTED' : 'ERROR'
    const errorMessage = response.ok ? null : `Provider returned HTTP ${response.status}.`
    await prisma.providerConnection.update({ where: { providerId: provider.id }, data: { status, lastTestedAt: new Date(), lastError: errorMessage } })
    res.json({ ok: response.ok, status, httpStatus: response.status, latencyMs: Date.now() - startedAt, error: errorMessage })
  } catch (error) {
    const message = error.name === 'TimeoutError' ? 'Provider connection timed out.' : 'Unable to reach provider API.'
    await prisma.providerConnection.update({ where: { providerId: provider.id }, data: { status: 'ERROR', lastTestedAt: new Date(), lastError: message } })
    res.status(502).json({ ok: false, status: 'ERROR', latencyMs: Date.now() - startedAt, error: message })
  }
})

app.get('/api/admin/providers', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.json({ providers: getProviderCatalog().map((provider) => ({ ...provider, active: true, cities: [], rideTypes: [] })) })
  const providers = await prisma.provider.findMany({ orderBy: { createdAt: 'desc' } })
  res.json({ providers })
})

app.post('/api/admin/providers', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.status(503).json({ error: 'Database is required to save providers.' })
  const { name, code, integrationType = 'DEMO', bookingUrl = null, cities = [], rideTypes = [], active = true } = req.body || {}
  if (!String(name || '').trim() || !String(code || '').trim()) return res.status(400).json({ error: 'Provider name and code are required.' })
  try {
    const provider = await prisma.provider.upsert({
      where: { code: String(code).trim().toLowerCase() },
      update: { name: String(name).trim(), integrationType, bookingUrl, cities, rideTypes, active },
      create: { name: String(name).trim(), code: String(code).trim().toLowerCase(), integrationType, bookingUrl, cities, rideTypes, active },
    })
    res.status(201).json({ provider })
  } catch { res.status(400).json({ error: 'Unable to save provider. Check the provider code and fields.' }) }
})

app.patch('/api/admin/providers/:code', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  if (!expectedToken || req.headers['x-admin-token'] !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.status(503).json({ error: 'Database is required to update providers.' })
  try {
    const data = {}
    for (const field of ['name', 'integrationType', 'bookingUrl', 'cities', 'rideTypes']) {
      if (req.body && req.body[field] !== undefined) data[field] = req.body[field]
    }
    if (req.body?.active !== undefined) data.active = Boolean(req.body.active)
    const provider = await prisma.provider.update({ where: { code: req.params.code }, data })
    res.json({ provider })
  } catch { res.status(404).json({ error: 'Provider not found.' }) }
})

app.get('/api/admin/analytics', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  const suppliedToken = String(req.headers['x-admin-token'] || '')
  if (!expectedToken || suppliedToken !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })
  if (!prisma) return res.json({ days: 30, totals: {}, providers: [], rideTypes: [], cities: [], conversionRate: 0 })

  const days = Math.min(Math.max(Number(req.query.days || 30), 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  try {
    const events = await prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { eventType: true, providerCode: true, rideType: true, city: true },
    })
    const count = (type) => events.filter((item) => item.eventType === type).length
    const group = (key, limit = 8) => {
      const map = new Map()
      for (const item of events) if (item[key]) map.set(item[key], (map.get(item[key]) || 0) + 1)
      return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }))
    }
    const searches = count('SEARCH')
    const handoffs = count('HANDOFF')
    res.json({
      days,
      totals: { searches, resultsShown: count('RESULTS_SHOWN'), providerSelections: count('PROVIDER_SELECTED'), handoffs },
      providers: group('providerCode'),
      rideTypes: group('rideType'),
      cities: group('city'),
      conversionRate: searches ? Number(((handoffs / searches) * 100).toFixed(1)) : 0,
    })
  } catch (error) {
    console.error('Analytics dashboard failed:', error.message)
    res.status(503).json({ error: 'Unable to load analytics.' })
  }
})

app.get('/api/admin/overview', async (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN
  const suppliedToken = String(req.headers['x-admin-token'] || '')
  if (!expectedToken || !suppliedToken || suppliedToken !== expectedToken) return res.status(401).json({ error: 'Admin access denied.' })

  if (prisma) {
    try {
      const [users, providers, drivers, bookingsCount, pending, confirmed, completed, cancelled, recent] = await Promise.all([
        prisma.user.count(),
        prisma.provider.count({ where: { active: true } }),
        prisma.driver.count(),
        prisma.booking.count(),
        prisma.booking.count({ where: { status: 'PAYMENT_PENDING' } }),
        prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'] } } }),
        prisma.booking.count({ where: { status: 'COMPLETED' } }),
        prisma.booking.count({ where: { status: 'CANCELLED' } }),
        prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { provider: true, driver: true } }),
      ])
      const revenue = await prisma.booking.aggregate({ where: { status: 'COMPLETED' }, _sum: { total: true, fare: true, platformFee: true } })
      return res.json({ users, providers, drivers, bookings: bookingsCount, pending, active: confirmed, completed, cancelled, revenue: revenue._sum, recent })
    } catch (error) {
      console.error('Admin overview failed:', error.message)
      return res.status(503).json({ error: 'Unable to load admin overview.' })
    }
  }

  const all = [...bookings.values()]
  const sum = (field) => all.filter((item) => item.status === 'COMPLETED').reduce((total, item) => total + Number(item[field] || 0), 0)
  res.json({
    users: new Set(all.map((item) => item.phone).filter(Boolean)).size,
    providers: new Set(all.map((item) => item.providerId).filter(Boolean)).size,
    drivers: drivers.size,
    bookings: all.length,
    pending: all.filter((item) => item.status === 'PAYMENT_PENDING').length,
    active: all.filter((item) => ['CONFIRMED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(item.status)).length,
    completed: all.filter((item) => item.status === 'COMPLETED').length,
    cancelled: all.filter((item) => item.status === 'CANCELLED').length,
    revenue: { total: sum('total'), fare: sum('fare'), platformFee: sum('platformFee') },
    recent: all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20),
  })
})

app.post('/api/providers/drivers', async (req, res) => {
  const { name, phone, vehicleType, vehicleNumber, providerCode = 'rydex-demo' } = req.body
  const normalizedPhone = String(phone || '').replace(/\s+/g, '')
  if (!name || !/^\+?[1-9]\d{9,14}$/.test(normalizedPhone) || !vehicleType) {
    return res.status(400).json({ error: 'Name, valid phone and vehicle type are required.' })
  }

  if (prisma) {
    try {
      const provider = await prisma.provider.upsert({
        where: { code: providerCode },
        update: { active: true },
        create: { code: providerCode, name: providerCode === 'rydex-demo' ? 'Rydex Demo Partner' : providerCode },
      })
      const driver = await prisma.driver.upsert({
        where: { phone: normalizedPhone },
        update: { name, vehicleType, vehicleNumber: vehicleNumber || null, providerId: provider.id },
        create: { name, phone: normalizedPhone, vehicleType, vehicleNumber: vehicleNumber || null, providerId: provider.id },
      })
      return res.status(201).json(driver)
    } catch (error) {
      console.error('Driver registration failed:', error.message)
      return res.status(503).json({ error: 'Unable to register driver.' })
    }
  }

  const driver = { id: `DRV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name, phone: normalizedPhone, vehicleType, vehicleNumber: vehicleNumber || null, available: true, providerCode }
  drivers.set(driver.id, driver)
  res.status(201).json(driver)
})

app.get('/api/providers/drivers', async (req, res) => {
  if (prisma) {
    try {
      const list = await prisma.driver.findMany({ where: { available: true }, orderBy: { createdAt: 'asc' } })
      return res.json({ drivers: list })
    } catch (error) {
      console.error('Driver list failed:', error.message)
      return res.status(503).json({ error: 'Unable to load drivers.' })
    }
  }
  res.json({ drivers: [...drivers.values()].filter((driver) => driver.available) })
})

app.post('/api/providers/drivers/:driverId/availability', async (req, res) => {
  const available = Boolean(req.body.available)
  if (prisma) {
    try {
      const driver = await prisma.driver.update({ where: { id: req.params.driverId }, data: { available } })
      return res.json(driver)
    } catch {
      return res.status(404).json({ error: 'Driver not found.' })
    }
  }
  const driver = drivers.get(req.params.driverId)
  if (!driver) return res.status(404).json({ error: 'Driver not found.' })
  driver.available = available
  drivers.set(driver.id, driver)
  res.json(driver)
})

app.get('/api/providers/bookings', async (req, res) => {
  const status = String(req.query.status || 'CONFIRMED')
  if (prisma) {
    try {
      const list = await prisma.booking.findMany({
        where: { status, driverId: null },
        orderBy: { createdAt: 'asc' },
      })
      return res.json({ bookings: list })
    } catch (error) {
      console.error('Provider booking queue failed:', error.message)
      return res.status(503).json({ error: 'Unable to load provider bookings.' })
    }
  }
  const list = [...bookings.values()].filter((booking) => booking.status === status && !booking.driverId)
  res.json({ bookings: list })
})

app.post('/api/providers/drivers/:driverId/accept', async (req, res) => {
  const bookingId = String(req.body.bookingId || '')
  if (!bookingId) return res.status(400).json({ error: 'Booking ID is required.' })

  if (prisma) {
    try {
      const [booking, driver] = await Promise.all([
        prisma.booking.findUnique({ where: { id: bookingId } }),
        prisma.driver.findUnique({ where: { id: req.params.driverId } }),
      ])
      if (!booking) return res.status(404).json({ error: 'Booking not found.' })
      if (!driver || !driver.available) return res.status(409).json({ error: 'Driver is not available.' })
      if (booking.status !== 'CONFIRMED') return res.status(409).json({ error: 'Only paid bookings can be accepted.' })

      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: { driverId: driver.id, providerId: driver.providerId, status: 'DRIVER_ASSIGNED', providerRideId: `RIDE-${crypto.randomUUID().slice(0, 8).toUpperCase()}` },
        include: { driver: true, provider: true },
      })
      await prisma.driver.update({ where: { id: driver.id }, data: { available: false } })
      return res.json(updated)
    } catch (error) {
      console.error('Driver assignment failed:', error.message)
      return res.status(503).json({ error: 'Unable to assign driver.' })
    }
  }

  const booking = bookings.get(bookingId)
  const driver = drivers.get(req.params.driverId)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (!driver || !driver.available) return res.status(409).json({ error: 'Driver is not available.' })
  if (booking.status !== 'CONFIRMED') return res.status(409).json({ error: 'Only paid bookings can be accepted.' })
  booking.status = 'DRIVER_ASSIGNED'
  booking.driverId = driver.id
  booking.providerRideId = `RIDE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  driver.available = false
  bookings.set(booking.id, booking)
  drivers.set(driver.id, driver)
  res.json(booking)
})

app.post('/api/auth/request-otp', (req, res) => {
  const normalizedPhone = String(req.body.phone || '').replace(/\s+/g, '')
  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'Enter a valid mobile number.' })
  }

  if (!allowRateLimit(`otp:${normalizedPhone}`)) return res.status(429).json({ error: 'Too many OTP requests. Try again later.' })

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

  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone) || !challenge) {
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

app.get('/api/bookings', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const session = sessions.get(token)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })

  if (prisma) {
    try {
      const bookingsForUser = await prisma.booking.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
      })
      return res.json({ bookings: bookingsForUser })
    } catch (error) {
      console.error('Database booking history failed:', error.message)
      return res.status(503).json({ error: 'Unable to load bookings.' })
    }
  }

  const bookingsForUser = [...bookings.values()]
    .filter((booking) => booking.phone === session.phone)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  res.json({ bookings: bookingsForUser })
})

app.get('/api/auth/me', async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
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
  const { pickup, destination, rideId, rideName, fare, phone, providerCode, pickupLat, pickupLng, destinationLat, destinationLng } = req.body
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })
  const numericFare = Number(fare)
  const normalizedProviderCode = String(providerCode || 'rydex-partner').trim()
  const normalizedPhone = String(phone || '').replace(/\s+/g, '')

  if (!pickup || !destination || !rideId || !rideName || !Number.isFinite(numericFare)) {
    return res.status(400).json({ error: 'Complete ride details are required.' })
  }

  if (!/^\+?[1-9]\d{9,14}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'Enter a valid mobile number.' })
  }

  if (normalizedPhone !== session.phone) return res.status(403).json({ error: 'Booking phone must match your signed-in number.' })

  const routeCoords = [pickupLat, pickupLng, destinationLat, destinationLng].map(Number)
  const hasRouteCoords = routeCoords.every(Number.isFinite)
  const routeEstimate = hasRouteCoords ? await getRouteEstimate({ pickupLat: routeCoords[0], pickupLng: routeCoords[1], destinationLat: routeCoords[2], destinationLng: routeCoords[3] }) : null

  const booking = {
    id: `RDX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    status: 'PAYMENT_PENDING',
    pickup,
    destination,
    ...(hasRouteCoords ? { pickupLat: routeCoords[0], pickupLng: routeCoords[1], destinationLat: routeCoords[2], destinationLng: routeCoords[3], distanceKm: routeEstimate?.distanceKm || null, durationMin: routeEstimate?.durationMin || null } : {}),
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

      const provider = await prisma.provider.upsert({
        where: { code: normalizedProviderCode },
        update: { active: true },
        create: { code: normalizedProviderCode, name: normalizedProviderCode === 'rydex-partner' ? 'Rydex Partner' : normalizedProviderCode, active: true },
      })

      const saved = await prisma.booking.create({
        data: {
          id: booking.id,
          providerId: provider.id,
          userId: user.id,
          pickup: booking.pickup,
          destination: booking.destination,
          pickupLat: booking.pickupLat,
          pickupLng: booking.pickupLng,
          destinationLat: booking.destinationLat,
          destinationLng: booking.destinationLng,
          distanceKm: booking.distanceKm,
          durationMin: booking.durationMin,
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
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })
  const bookingId = req.params.id

  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return res.status(404).json({ error: 'Booking not found.' })
      if (booking.userId !== session.userId) return res.status(403).json({ error: 'You cannot cancel this booking.' })

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

const DRIVER_TRANSITIONS = {
  DRIVER_ASSIGNED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
}

app.post('/api/providers/drivers/:driverId/location', async (req, res) => {
  const latitude = Number(req.body.latitude)
  const longitude = Number(req.body.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required.' })
  }

  if (prisma) {
    try {
      const driver = await prisma.driver.update({
        where: { id: req.params.driverId },
        data: { latitude, longitude, locationAt: new Date() },
      })
      return res.json({ id: driver.id, latitude: driver.latitude, longitude: driver.longitude, locationAt: driver.locationAt })
    } catch {
      return res.status(404).json({ error: 'Driver not found.' })
    }
  }

  const driver = drivers.get(req.params.driverId)
  if (!driver) return res.status(404).json({ error: 'Driver not found.' })
  driver.latitude = latitude
  driver.longitude = longitude
  driver.locationAt = new Date().toISOString()
  drivers.set(driver.id, driver)
  res.json({ id: driver.id, latitude, longitude, locationAt: driver.locationAt })
})

app.get('/api/bookings/:id/tracking', async (req, res) => {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })
  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: req.params.id },
        include: { driver: true },
      })
      if (!booking) return res.status(404).json({ error: 'Booking not found.' })
      if (booking.userId !== session.userId) return res.status(403).json({ error: 'You cannot view this ride.' })
      return res.json({
        bookingId: booking.id,
        status: booking.status,
        pickup: { lat: booking.pickupLat, lng: booking.pickupLng },
        destination: { lat: booking.destinationLat, lng: booking.destinationLng },
        driver: booking.driver ? {
          id: booking.driver.id,
          name: booking.driver.name,
          vehicleType: booking.driver.vehicleType,
          vehicleNumber: booking.driver.vehicleNumber,
          latitude: booking.driver.latitude,
          longitude: booking.driver.longitude,
          locationAt: booking.driver.locationAt,
        } : null,
      })
    } catch (error) {
      console.error('Tracking lookup failed:', error.message)
      return res.status(503).json({ error: 'Unable to load live tracking.' })
    }
  }

  const booking = bookings.get(req.params.id)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  const driver = booking.driverId ? drivers.get(booking.driverId) : null
  res.json({
    bookingId: booking.id,
    status: booking.status,
    pickup: { lat: booking.pickupLat || null, lng: booking.pickupLng || null },
    destination: { lat: booking.destinationLat || null, lng: booking.destinationLng || null },
    driver: driver ? {
      id: driver.id,
      name: driver.name,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      latitude: driver.latitude || null,
      longitude: driver.longitude || null,
      locationAt: driver.locationAt || null,
    } : null,
  })
})

app.get('/api/providers/drivers/:driverId/rides', async (req, res) => {
  if (prisma) {
    try {
      const rides = await prisma.booking.findMany({
        where: { driverId: req.params.driverId, status: { in: ['DRIVER_ASSIGNED', 'IN_PROGRESS'] } },
        orderBy: { updatedAt: 'desc' },
      })
      return res.json({ bookings: rides })
    } catch (error) {
      console.error('Driver rides lookup failed:', error.message)
      return res.status(503).json({ error: 'Unable to load driver rides.' })
    }
  }
  const rides = [...bookings.values()].filter((booking) => booking.driverId === req.params.driverId && ['DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(booking.status))
  res.json({ bookings: rides })
})

app.post('/api/providers/drivers/:driverId/status', async (req, res) => {
  const { bookingId, status } = req.body
  if (!bookingId || !DRIVER_TRANSITIONS[status] && !['DRIVER_ASSIGNED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid ride status.' })
  }

  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
      if (!booking) return res.status(404).json({ error: 'Booking not found.' })
      if (booking.driverId !== req.params.driverId) return res.status(403).json({ error: 'This ride is not assigned to this driver.' })
      const expectedPrevious = status === 'DRIVER_ASSIGNED' ? 'CONFIRMED' : Object.keys(DRIVER_TRANSITIONS).find((key) => DRIVER_TRANSITIONS[key] === status)
      if (booking.status !== expectedPrevious) {
        return res.status(409).json({ error: `Ride must be ${expectedPrevious.replaceAll('_', ' ').toLowerCase()} before this action.` })
      }

      const updated = await prisma.booking.update({ where: { id: bookingId }, data: { status } })
      if (status === 'COMPLETED') {
        await prisma.driver.update({ where: { id: req.params.driverId }, data: { available: true } })
      }
      return res.json(updated)
    } catch (error) {
      console.error('Ride status update failed:', error.message)
      return res.status(503).json({ error: 'Unable to update ride status.' })
    }
  }

  const booking = bookings.get(bookingId)
  const driver = drivers.get(req.params.driverId)
  if (!booking) return res.status(404).json({ error: 'Booking not found.' })
  if (!driver || booking.driverId !== driver.id) return res.status(403).json({ error: 'This ride is not assigned to this driver.' })
  const expectedPrevious = status === 'DRIVER_ASSIGNED' ? 'CONFIRMED' : Object.keys(DRIVER_TRANSITIONS).find((key) => DRIVER_TRANSITIONS[key] === status)
  if (booking.status !== expectedPrevious) return res.status(409).json({ error: 'Invalid ride status transition.' })
  booking.status = status
  booking.updatedAt = new Date().toISOString()
  if (status === 'COMPLETED') driver.available = true
  bookings.set(booking.id, booking)
  drivers.set(driver.id, driver)
  res.json(booking)
})

app.get('/api/bookings/:id', async (req, res) => {
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Not signed in.' })
  if (prisma) {
    try {
      const booking = await prisma.booking.findUnique({ where: { id: req.params.id } })
      if (booking && booking.userId !== session.userId) return res.status(403).json({ error: 'You cannot view this booking.' })
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
  if (booking.phone !== session.phone) return res.status(403).json({ error: 'You cannot view this booking.' })
  res.json(booking)
})

if (process.env.NODE_ENV === 'production') {
  const rootDir = path.dirname(fileURLToPath(import.meta.url))
  const distDir = path.join(rootDir, '..', 'dist')
  app.use(express.static(distDir))
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

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
