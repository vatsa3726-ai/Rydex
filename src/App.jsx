import { useEffect, useMemo, useState } from 'react'
import './App.css'
import RydexMap from './RydexMap.jsx'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'

const demoRides = [
  { id: 'auto', icon: '🛺', name: 'Auto', provider: 'Rydex Partner', eta: 4, fare: 180, seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', provider: 'Rydex Partner', eta: 3, fare: 125, seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', provider: 'Rydex Partner', eta: 6, fare: 290, seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', provider: 'Rydex Partner', eta: 8, fare: 420, seats: '1–4' },
]

function App() {
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [pickupCoords, setPickupCoords] = useState(null)
  const [destinationCoords, setDestinationCoords] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [landmarkQuery, setLandmarkQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [sort, setSort] = useState('recommended')
  const [rideFilter, setRideFilter] = useState('all')
  const [rides, setRides] = useState(demoRides)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [apiNotice, setApiNotice] = useState('')
  const [booking, setBooking] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [phone, setPhone] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authStep, setAuthStep] = useState('phone')
  const [authPhone, setAuthPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpHint, setOtpHint] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authNotice, setAuthNotice] = useState('')
  const [bookings, setBookings] = useState([])
  const [bookingsOpen, setBookingsOpen] = useState(false)
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [driverConsoleOpen, setDriverConsoleOpen] = useState(false)
  const [providerPortalOpen, setProviderPortalOpen] = useState(false)
  const [providerDrivers, setProviderDrivers] = useState([])
  const [providerQueue, setProviderQueue] = useState([])
  const [providerLoading, setProviderLoading] = useState(false)
  const [providerCode, setProviderCode] = useState('rydex-demo')
  const [providerToken, setProviderToken] = useState(() => sessionStorage.getItem('rydexProviderToken') || '')
  const [providerEarnings, setProviderEarnings] = useState(null)
  const [partnerForm, setPartnerForm] = useState({ companyName: '', contactName: '', email: '', phone: '', website: '', cities: '', rideTypes: 'auto,bike,cab', integrationType: 'BOOKING_LINK', notes: '' })
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('rydexAdminToken') || '')
  const [adminData, setAdminData] = useState(null)
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminProviders, setAdminProviders] = useState([])
  const [providerForm, setProviderForm] = useState({ name: '', code: '', integrationType: 'DEMO', bookingUrl: '', cities: '', rideTypes: 'auto,bike,cab,premium', active: true })
  const [driverId, setDriverId] = useState('')
  const [driverBookings, setDriverBookings] = useState([])
  const [driverAvailable, setDriverAvailable] = useState(true)
  const [driverRide, setDriverRide] = useState(null)
  const [trackingOpen, setTrackingOpen] = useState(false)
  const [trackingBooking, setTrackingBooking] = useState(null)
  const [tracking, setTracking] = useState(null)
  const providerHeaders = () => providerToken ? { 'X-Provider-Token': providerToken } : {};

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rydexUser') || 'null') } catch { return null }
  })

  useEffect(() => {
    const token = localStorage.getItem('rydexToken')
    if (!token) return
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('rydexToken')
        localStorage.removeItem('rydexUser')
        setUser(null)
      })
  }, [])

  useEffect(() => {
    if (!driverId || !driverRide || !navigator.geolocation) return undefined
    const watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
      try {
        await fetch(`${API_URL}/providers/drivers/${driverId}/location`, {
          method: 'POST',
          headers: { ...providerHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude }),
        })
      } catch {}
    }, () => {}, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 })
    return () => navigator.geolocation.clearWatch(watchId)
  }, [driverId, driverRide?.id])

  const loadProviderPortal = async () => {
    setProviderLoading(true)
    try {
      const [driversResponse, queueResponse, earningsResponse] = await Promise.all([
        fetch(`${API_URL}/providers/drivers`, { headers: providerHeaders() }),
        fetch(`${API_URL}/providers/bookings?status=CONFIRMED`, { headers: providerHeaders() }),
        fetch(`${API_URL}/providers/earnings?providerCode=${encodeURIComponent(providerCode)}`, { headers: providerHeaders() }),
      ])
      const driversData = await driversResponse.json()
      const queueData = await queueResponse.json()
      const earningsData = await earningsResponse.json()
      if (!driversResponse.ok) throw new Error(driversData.error || 'Unable to load drivers.')
      if (!queueResponse.ok) throw new Error(queueData.error || 'Unable to load ride requests.')
      if (!earningsResponse.ok) throw new Error(earningsData.error || 'Unable to load earnings.')
      setProviderDrivers(driversData.drivers || [])
      setProviderQueue(queueData.bookings || [])
      setProviderEarnings(earningsData)
    } catch (error) {
      setApiNotice(error.message || 'Unable to load provider dashboard.')
    } finally {
      setProviderLoading(false)
    }
  }

  const loadAdminDashboard = async () => {
    if (!adminToken) return
    setAdminLoading(true)
    try {
      const response = await fetch(`${API_URL}/admin/overview`, { headers: { 'X-Admin-Token': adminToken } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load admin dashboard.')
      sessionStorage.setItem('rydexAdminToken', adminToken)
      setAdminData(data)
    } catch (error) {
      setApiNotice(error.message || 'Unable to load admin dashboard.')
    } finally {
      setAdminLoading(false)
    }
  }

  const loadAdminProviders = async () => {
    if (!adminToken) return
    const response = await fetch(`${API_URL}/api/admin/providers`, { headers: { 'X-Admin-Token': adminToken } })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load providers.')
    setAdminProviders(data.providers || [])
  }

  const saveAdminProvider = async () => {
    if (!adminToken || !providerForm.name.trim() || !providerForm.code.trim()) return
    const response = await fetch(`${API_URL}/api/admin/providers`, {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...providerForm,
        cities: providerForm.cities.split(',').map((item) => item.trim()).filter(Boolean),
        rideTypes: providerForm.rideTypes.split(',').map((item) => item.trim()).filter(Boolean),
        bookingUrl: providerForm.bookingUrl.trim() || null,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to save provider.')
    setProviderForm({ name: '', code: '', integrationType: 'DEMO', bookingUrl: '', cities: '', rideTypes: 'auto,bike,cab,premium', active: true })
    setApiNotice('Provider saved successfully.')
    await loadAdminProviders()
  }

  const toggleAdminProvider = async (provider) => {
    const response = await fetch(`${API_URL}/api/admin/providers/${encodeURIComponent(provider.code)}`, {
      method: 'PATCH',
      headers: { 'X-Admin-Token': adminToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !provider.active }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to update provider.')
    await loadAdminProviders()
  }

  const submitPartnerApplication = async () => {
    const response = await fetch(`${API_URL}/api/partners/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...partnerForm,
        cities: partnerForm.cities.split(',').map((item) => item.trim()).filter(Boolean),
        rideTypes: partnerForm.rideTypes.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to submit application.')
    setApiNotice('Partner application submitted. Our team can review it from Admin.')
    setPartnerForm({ companyName: '', contactName: '', email: '', phone: '', website: '', cities: '', rideTypes: 'auto,bike,cab', integrationType: 'BOOKING_LINK', notes: '' })
  }

  const openAdminDashboard = async () => {
    setAdminOpen(true)
    if (adminToken) { await loadAdminDashboard(); await loadAdminProviders() }
  }

  const openProviderPortal = async () => {
    setProviderPortalOpen(true)
    await loadProviderPortal()
  }

  const loadDriverRide = async () => {
    if (!driverId) return
    try {
      const response = await fetch(`${API_URL}/providers/drivers/${driverId}/rides`, { headers: providerHeaders() })
      const data = await response.json()
      if (response.ok) setDriverRide(data.bookings?.[0] || null)
    } catch {}
  }

  const updateDriverRideStatus = async (status) => {
    if (!driverId || !driverRide) return
    const response = await fetch(`${API_URL}/providers/drivers/${driverId}/status`, {
      headers: { ...providerHeaders(), 'Content-Type': 'application/json' },
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: driverRide.id, status }),
    })
    const data = await response.json()
    if (!response.ok) {
      setApiNotice(data.error || 'Unable to update ride.')
      return
    }
    setDriverRide(status === 'COMPLETED' ? null : data)
    if (status === 'COMPLETED') setDriverAvailable(true)
    setApiNotice(status === 'IN_PROGRESS' ? 'Ride started.' : 'Ride completed.')
  }

  const loadDriverQueue = async () => {
    try {
      const response = await fetch(`${API_URL}/providers/bookings?status=CONFIRMED`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load provider queue.')
      setDriverBookings(data.bookings || [])
    } catch (error) {
      setApiNotice(error.message || 'Unable to load provider queue.')
    }
  }

  const registerDemoDriver = async () => {
    try {
      const response = await fetch(`${API_URL}/providers/drivers`, {
        headers: { ...providerHeaders(), 'Content-Type': 'application/json' },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Rydex Demo Driver', phone: '+919999999999', vehicleType: 'Cab', vehicleNumber: 'KA01RYDEX' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to register driver.')
      setDriverId(data.id)
      setDriverAvailable(data.available)
      await loadDriverRide()
      setApiNotice('Demo driver is ready.')
      await loadDriverQueue()
    } catch (error) {
      setApiNotice(error.message || 'Unable to register demo driver.')
    }
  }

  const toggleDriverAvailability = async () => {
    if (!driverId) return
    const response = await fetch(`${API_URL}/providers/drivers/${driverId}/availability`, {
      headers: { ...providerHeaders(), 'Content-Type': 'application/json' },
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !driverAvailable }),
    })
    const data = await response.json()
    if (response.ok) setDriverAvailable(data.available)
  }

  const acceptDriverBooking = async (bookingId) => {
    if (!driverId) return
    const response = await fetch(`${API_URL}/providers/drivers/${driverId}/accept`, {
      headers: { ...providerHeaders(), 'Content-Type': 'application/json' },
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId }),
    })
    const data = await response.json()
    if (!response.ok) {
      setApiNotice(data.error || 'Unable to accept ride.')
      return
    }
    setApiNotice(`Ride ${data.id} assigned to your driver.`)
    setDriverAvailable(false)
    await loadDriverQueue()
    await loadDriverRide()
  }

  const loadTracking = async (bookingId) => {
    try {
      const response = await fetch(`${API_URL}/bookings/${bookingId}/tracking`, { headers: { Authorization: `Bearer ${localStorage.getItem('rydexToken') || ''}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load tracking.')
      setTracking(data)
    } catch (error) {
      setApiNotice(error.message || 'Unable to load live tracking.')
    }
  }

  const openTracking = async (item) => {
    setTrackingBooking(item)
    setTrackingOpen(true)
    await loadTracking(item.id)
  }

  const loadBookings = async () => {
    const token = localStorage.getItem('rydexToken')
    if (!token) {
      setAuthOpen(true)
      return
    }
    setBookingsLoading(true)
    try {
      const response = await fetch(`${API_URL}/bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load bookings.')
      setBookings(data.bookings || [])
      setBookingsOpen(true)
    } catch (error) {
      setApiNotice(error.message || 'Unable to load bookings.')
    } finally {
      setBookingsLoading(false)
    }
  }

  useEffect(() => {
    if (!trackingOpen || !trackingBooking?.id) return undefined
    const timer = window.setInterval(() => loadTracking(trackingBooking.id), 5000)
    return () => window.clearInterval(timer)
  }, [trackingOpen, trackingBooking?.id])

  const requestOtp = async (event) => {
    event?.preventDefault()
    const normalized = authPhone.replace(/\s+/g, '')
    if (!/^\+?[1-9]\d{9,14}$/.test(normalized)) {
      setAuthNotice('Enter a valid mobile number.')
      return
    }
    setAuthLoading(true)
    setAuthNotice('')
    try {
      const response = await fetch(`${API_URL}/auth/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to send OTP.')
      setAuthStep('otp')
      setOtpHint(data.demoCode ? `Demo OTP: ${data.demoCode}` : 'OTP sent to your mobile number.')
    } catch {
      setAuthNotice('Backend is not running. Start the Rydex API and try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const verifyOtp = async (event) => {
    event?.preventDefault()
    setAuthLoading(true)
    setAuthNotice('')
    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: authPhone.replace(/\s+/g, ''), code: otp }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to verify OTP.')
      localStorage.setItem('rydexToken', data.token)
      localStorage.setItem('rydexUser', JSON.stringify(data.user))
      setUser(data.user)
      setAuthOpen(false)
      setAuthStep('phone')
      setOtp('')
      setOtpHint('')
    } catch (error) {
      setAuthNotice(error.message || 'Incorrect OTP.')
    } finally {
      setAuthLoading(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('rydexToken')
    localStorage.removeItem('rydexUser')
    setUser(null)
  }

  const sortedRides = useMemo(() => {
    const list = [...rides].filter((ride) => rideFilter === 'all' || ride.rideType === rideFilter || ride.id === rideFilter)
    if (sort === 'price') return list.sort((a, b) => a.fare - b.fare)
    if (sort === 'eta') return list.sort((a, b) => a.pickupEta - b.pickupEta)
    return list
  }, [rides, sort, rideFilter])

  const comparisonGroups = useMemo(() => {
    const groups = ['auto', 'bike', 'cab', 'premium']
      .map((type) => ({ type, rides: sortedRides.filter((ride) => ride.rideType === type) }))
      .filter((group) => group.rides.length)
    return groups.map((group) => ({
      ...group,
      cheapest: group.rides.reduce((best, ride) => ride.fare < best.fare ? ride : best, group.rides[0]),
      fastest: group.rides.reduce((best, ride) => ride.pickupEta < best.pickupEta ? ride : best, group.rides[0]),
    }))
  }, [sortedRides])

  const resolvePlace = async (query) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key || !query.trim()) return null
    try {
      const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader')
      setOptions({ key, v: 'weekly' })
      const { AutocompleteSuggestion } = await importLibrary('places')
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query.trim(),
        includedRegionCodes: ['in'],
      })
      const prediction = suggestions?.[0]?.placePrediction
      if (!prediction) return null
      const place = prediction.toPlace()
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      if (!place.location) return null
      return { name: place.displayName || place.formattedAddress || query, lat: place.location.lat(), lng: place.location.lng() }
    } catch {
      return null
    }
  }

  const searchRides = async (event) => {
    event.preventDefault()
    if (!pickup.trim() || !destination.trim()) return

    setLoading(true)
    setApiNotice('')
    setBooking(null)

    const resolvedPickup = pickupCoords || await resolvePlace(pickup)
    const resolvedDestination = destinationCoords || await resolvePlace(destination)
    if (resolvedPickup && !pickupCoords) setPickupCoords({ pickupLat: resolvedPickup.lat, pickupLng: resolvedPickup.lng })
    if (resolvedDestination && !destinationCoords) setDestinationCoords({ destinationLat: resolvedDestination.lat, destinationLng: resolvedDestination.lng })

    try {
      const response = await fetch(`${API_URL}/rides/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          destination,
          ...(resolvedPickup ? { pickupLat: resolvedPickup.lat, pickupLng: resolvedPickup.lng } : {}),
          ...(resolvedDestination ? { destinationLat: resolvedDestination.lat, destinationLng: resolvedDestination.lng } : {}),
        }),
      })

      if (!response.ok) throw new Error('API request failed')
      const data = await response.json()
      setRides(data.rides)
    } catch {
      setRides(demoRides)
      setApiNotice('Demo mode: start the Rydex API on port 4000 for live backend data.')
    } finally {
      setLoading(false)
      setSearched(true)
      setSelected(null)
    }
  }


  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setApiNotice('Location services are not supported on this device.')
      return
    }

    setLocationLoading(true)
    setApiNotice('Getting your current location…')

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPickupCoords({ pickupLat: coords.latitude, pickupLng: coords.longitude })
        setPickup('Current location')
        setLocationLoading(false)
        setApiNotice('Pickup location detected.')
      },
      () => {
        setLocationLoading(false)
        setApiNotice('Could not access your location. Please enter pickup manually.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  const loadRazorpay = () => new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = resolve
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout'))
    document.body.appendChild(script)
  })

  const startPayment = async () => {
    if (!booking) return
    setPaymentLoading(true)
    setApiNotice('')

    try {
      const response = await fetch(`${API_URL}/payments/order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('rydexToken') || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create payment order.')

      await loadRazorpay()

      const checkout = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Rydex',
        description: `${booking.rideName} ride`,
        order_id: data.orderId,
        prefill: { name: 'Rydex Customer' },
        theme: { color: '#ff1493' },
        handler: async (payment) => {
          try {
            const verify = await fetch(`${API_URL}/payments/verify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('rydexToken') || ''}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: booking.id,
              razorpayOrderId: payment.razorpay_order_id,
              razorpayPaymentId: payment.razorpay_payment_id,
              razorpaySignature: payment.razorpay_signature,
            }),
          })
          const result = await verify.json()
          if (!verify.ok) throw new Error(result.error || 'Payment verification failed.')
            setBooking(result.booking)
            setApiNotice('Payment verified successfully.')
          } catch (error) {
            setApiNotice(error.message || 'Payment verification failed.')
          } finally {
            setPaymentLoading(false)
          }
        },
        modal: { ondismiss: () => setPaymentLoading(false) },
      })

      checkout.open()
    } catch (error) {
      setApiNotice(error.message || 'Payment could not be started.')
      setPaymentLoading(false)
    }
  }

  const createBooking = async () => {
    if (!selected) return
    if (!user) {
      setAuthPhone(phone)
      setAuthNotice('Sign in with your mobile number before booking.')
      setAuthOpen(true)
      return
    }
    if (!/^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s+/g, ''))) {
      setApiNotice('Please enter a valid mobile number before booking.')
      return
    }

    setLoading(true)
    setApiNotice('')

    try {
      const response = await fetch(`${API_URL}/bookings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('rydexToken') || ''}`, 'Content-Type': 'application/json' },
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          destination,
          rideId: selected.id,
          providerCode: selected.providerCode,
          rideName: selected.name,
          fare: selected.fare,
          phone,
          ...(pickupCoords || {}),
          ...(destinationCoords || {}),
          distanceKm: selected.distanceKm,
          durationMin: selected.durationMin,
        }),
      })

      if (!response.ok) throw new Error('Booking request failed')
      setBooking(await response.json())
    } catch {
      setBooking({
        id: `RDX-DEMO-${Date.now().toString().slice(-6)}`,
        status: 'PAYMENT_PENDING',
        pickup,
        destination,
        rideName: selected.name,
        fare: selected.fare,
        platformFee: 8,
        total: selected.fare + 8,
      })
      setApiNotice('Demo booking created. Payment gateway will be connected next.')
    } finally {
      setLoading(false)
    }
  }

  const handleProviderHandoff = () => {
    if (!selected) return
    if (selected.bookingUrl) {
      window.open(selected.bookingUrl, '_blank', 'noopener,noreferrer')
      setApiNotice(`Opening ${selected.provider} to complete your ride.`)
      return
    }
    setApiNotice(`${selected.provider} is currently a demo comparison source. Its official booking link will be connected when the provider partnership/API is available.`)
  }

  const total = selected ? selected.fare : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setSearched(false); setSelected(null); setBooking(null) }}>
          <span className="brand-mark">R</span>
          <span>RYDEX</span>
        </a>
        <nav>
          <a href="#how">How it works</a>
          <button className="nav-link-btn" onClick={openProviderPortal}>Partner portal</button>
          <button className="nav-link-btn" onClick={openAdminDashboard}>Admin</button>
          {user && <button className="nav-link-btn" onClick={loadBookings}>{bookingsLoading ? "Loading…" : "My bookings"}</button>}\n          <a href="#support">Support</a>
          <button className="login-btn" onClick={() => user ? signOut() : setAuthOpen(true)}>{user ? 'Sign out' : 'Sign in'}</button>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">ONE SEARCH. EVERY RIDE.</span>
            <h1>Compare rides.<br /><span>Choose smarter.</span></h1>
            <p>Compare fares and pickup times from multiple ride providers in one place. Choose the best option, then continue with that provider.</p>
          </div>

          <form className="search-card" onSubmit={searchRides}>
            <div className="location-field">
              <span className="field-icon pickup-dot">●</span>
              <div>
                <label>Pickup</label>
                <input
                value={pickup}
                onChange={(e) => { setPickup(e.target.value); setPickupCoords(null) }}
                placeholder="Enter pickup location"
              />
              </div>
              <button className="location-btn" type="button" onClick={useCurrentLocation} disabled={locationLoading}>
                {locationLoading ? 'Locating…' : 'Use current location'}
              </button>
            </div>
            <div className="route-line" />
            <div className="location-field">
              <span className="field-icon destination-pin">◆</span>
              <div>
                <label>Destination</label>
                <input
                value={destination}
                onChange={(e) => { setDestination(e.target.value); setDestinationCoords(null) }}
                placeholder="Where are you going?"
              />
              </div>
            </div>
            <button className="search-btn" type="submit" disabled={loading}>
              {loading ? 'Searching…' : 'Search rides'} <span>→</span>
            </button>
          </form>

          <div className="trust-row">
            <span>✓ Compare prices</span>
            <span>✓ One checkout</span>
            <span>✓ Transparent ₹8 platform fee</span>
          </div>
          {apiNotice && <div className="api-notice">{apiNotice}</div>}
        </section>

<section className="landmark-panel"><div className="landmark-copy"><span className="eyebrow">LANDMARK SEARCH</span><h2>Find pickup points people actually use.</h2><p>Search metro stations, malls, hotels, airports, hospitals and popular landmarks.</p><div className="landmark-search"><span>⌕</span><input value={landmarkQuery} onChange={(e) => setLandmarkQuery(e.target.value)} placeholder="Try “MG Road Metro” or “near me”" /></div><div className="landmark-chips">{['Metro stations','Malls','Hotels','Hospitals','Airports'].map((item)=><button key={item} type="button" onClick={()=>setLandmarkQuery(item)}>{item}</button>)}</div></div><div className="map-preview"><div className="map-grid"><span className="map-road road-a"/><span className="map-road road-b"/><span className="map-road road-c"/><span className="map-road road-d"/><span className="map-pin map-pin-main">R</span><span className="map-poi poi-one">M</span><span className="map-poi poi-two">H</span><span className="map-poi poi-three">✦</span><span className="map-label label-one">Metro</span><span className="map-label label-two">Landmark</span></div><div className="map-overlay"><strong>Popular nearby places</strong><span>{landmarkQuery || 'Metro · malls · hotels · hospitals'}</span></div></div></section>

        {searched && (
          <section className="results-section">
            <div className="results-head">
              <div>
                <span className="eyebrow">RIDE OPTIONS</span>
                <h2>{pickup} <span>→</span> {destination}</h2>
              </div>
              <div className="results-tools">
                <div className="ride-filters" aria-label="Ride type filters">
                  {[['all','All'],['auto','Auto'],['bike','Bike'],['cab','Cab'],['premium','Premium']].map(([value,label]) => (
                    <button key={value} className={rideFilter === value ? 'filter-chip active' : 'filter-chip'} onClick={() => setRideFilter(value)}>{label}</button>
                  ))}
                </div>
                <div className="sort-control">
                <label>Sort</label>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="recommended">Recommended</option>
                  <option value="price">Lowest price</option>
                  <option value="eta">Fastest pickup</option>
                </select>
                </div>
              </div>
            </div>

            <div className="route-map-card">
              <div className="map-card-head"><div><span className="eyebrow">LIVE MAP</span><h3>{pickup} → {destination}</h3></div><span>Google Maps</span></div>
              <RydexMap
                pickupCoords={pickupCoords}
                destinationCoords={destinationCoords}
                onPlaceSelected={(place) => {
                  setLandmarkQuery(place.name)
                  setApiNotice(`Map location selected: ${place.name}`)
                }}
              />
            </div>

            <div className="results-grid">
              <div className="comparison-list">
                {comparisonGroups.map((group) => (
                  <section className="comparison-group" key={group.type}>
                    <div className="comparison-group-head">
                      <div><span className="ride-category">{group.rides[0].icon}</span><div><h3>{group.rides[0].name}</h3><small>{group.rides.length} provider options</small></div></div>
                      <span className="comparison-hint">Compare providers</span>
                    </div>
                    <div className="ride-list">
                      {group.rides.map((ride) => {
                        const badges = []
                        if (ride.id === group.cheapest.id) badges.push('CHEAPEST')
                        if (ride.id === group.fastest.id) badges.push('FASTEST')
                        if (ride.id === group.cheapest.id && ride.id === group.fastest.id) badges.push('BEST')
                        return <article className={`ride-card ${selected?.id === ride.id ? 'selected' : ''}`} key={ride.id}>
                          <div className="ride-icon">{ride.icon}</div>
                          <div className="ride-main">
                            <div className="ride-title"><h3>{ride.provider}</h3><span className="provider-badge">{ride.name}</span>{badges.map((badge) => <span className="best-badge" key={badge}>{badge}</span>)}</div>
                            <p>{ride.seats} seats · Pickup in {ride.pickupEta} min · Trip {ride.durationMin || '—'} min</p>
                          </div>
                          <div className="ride-price"><strong>₹{ride.fare}</strong><span>provider price{ride.distanceKm ? ` · ${ride.distanceKm} km` : ''}</span></div>
                          <button className="select-btn" onClick={() => { setSelected(ride); setBooking(null) }}>{selected?.id === ride.id ? 'Selected' : 'Choose'}</button>
                        </article>
                      })}
                    </div>
                  </section>
                ))}
              </div>

              <aside className="checkout-card">
                {booking ? (
                  <div className="booking-success">
                    <div className="success-icon">✓</div>
                    <span className="eyebrow">BOOKING CREATED</span>
                    <h3>{booking.rideName}</h3>
                    <p className="booking-id">Booking ID: <strong>{booking.id}</strong></p>
                    <div className="confirmation-price">
                      <span>Total</span>
                      <strong>₹{booking.total}</strong>
                    </div>
                    {booking.status === 'PAYMENT_PENDING' && (
                      <button className="pay-btn" onClick={startPayment} disabled={paymentLoading}>
                        {paymentLoading ? 'Opening payment…' : 'Pay securely'} <span>→</span>
                      </button>
                    )}
                    <p className="demo-note">Status: {booking.status}. Partner dispatch will follow payment confirmation.</p>
                    {['PAYMENT_PENDING', 'CONFIRMED'].includes(booking.status) && (
                      <button
                        className="cancel-btn"
                        onClick={async () => {
                          try {
                            const response = await fetch(`${API_URL}/bookings/${booking.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('rydexToken') || ''}` } })
                            const result = await response.json()
                            if (!response.ok) throw new Error(result.error || 'Unable to cancel booking.')
                            setBooking(result)
                            setApiNotice('Booking cancelled.')
                          } catch (error) {
                            setApiNotice(error.message || 'Unable to cancel booking.')
                          }
                        }}
                      >
                        Cancel booking
                      </button>
                    )}
                  </div>
                ) : selected ? (
                  <>
                    <div className="checkout-title">
                      <span>YOUR RIDE</span>
                      <span className="secure">● Secure</span>
                    </div>
                    <div className="chosen-ride">
                      <span className="large-icon">{selected.icon}</span>
                      <div>
                        <strong>{selected.name}</strong>
                        <p>Pickup in {selected.eta} min</p>
                      </div>
                    </div>
                    <div className="route-summary">
                      <span>●</span><p>{pickup}</p>
                      <span>◆</span><p>{destination}</p>
                    </div>
                    <div className="phone-field">
                      <label>Mobile number</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                      />
                      <small>Used for booking updates and driver contact.</small>
                    </div>
                    <div className="price-breakdown">
                      <div><span>Provider fare</span><strong>₹{selected.fare}</strong></div>
                      <div><span>Rydex platform fee</span><strong>₹0</strong></div>
                      <hr />
                      <div className="total"><span>Pay provider</span><strong>₹{total}</strong></div>
                    </div>
                    <button className="pay-btn" onClick={handleProviderHandoff}>
                      Continue with {selected.provider} <span>↗</span>
                    </button>
                    <p className="demo-note">Rydex compares prices. You complete the ride booking and payment with the selected provider.</p>
                  </>
                ) : (
                  <div className="empty-checkout">
                    <div className="empty-icon">↗</div>
                    <h3>Select a ride</h3>
                    <p>Choose an option to see the complete fare and checkout.</p>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {!searched && (
          <section className="feature-strip" id="how">
            <div><span>01</span><h3>Search once</h3><p>Enter your route once instead of opening multiple ride apps.</p></div>
            <div><span>02</span><h3>Compare</h3><p>See vehicle types, pickup time and total price side by side.</p></div>
            <div><span>03</span><h3>Book</h3><p>Choose the provider you want, then continue to their official booking flow.</p></div>
          </section>
        )}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button className="mobile-nav-item active" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>⌂</span><small>Home</small></button>
        <button className="mobile-nav-item" onClick={() => user ? loadBookings() : setAuthOpen(true)}><span>▣</span><small>Bookings</small></button>
        <button className="mobile-nav-item" onClick={() => setProviderPortalOpen(true)}><span>◆</span><small>Partners</small></button>
        <button className="mobile-nav-item" onClick={() => user ? signOut() : setAuthOpen(true)}><span>●</span><small>{user ? 'Sign out' : 'Account'}</small></button>
      </nav>

      {authOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => !authLoading && setAuthOpen(false)}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(event) => event.stopPropagation()}>
            <button className="auth-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button>
            <span className="eyebrow">RYDEX ACCOUNT</span>
            <h2 id="auth-title">{authStep === 'phone' ? 'Sign in with your phone' : 'Enter your OTP'}</h2>
            <p>{authStep === 'phone' ? 'Use your mobile number to access bookings and ride updates.' : `We sent a verification code to ${authPhone}.`}</p>
            {authStep === 'phone' ? (
              <form onSubmit={requestOtp}>
                <label className="auth-label">Mobile number</label>
                <input className="auth-input" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" autoFocus />
                <button className="pay-btn auth-submit" disabled={authLoading}>{authLoading ? 'Sending…' : 'Send OTP →'}</button>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <label className="auth-label">6-digit OTP</label>
                <input className="auth-input" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" inputMode="numeric" autoFocus />
                {otpHint && <div className="otp-hint">{otpHint}</div>}
                <button className="pay-btn auth-submit" disabled={authLoading}>{authLoading ? 'Verifying…' : 'Verify & sign in →'}</button>
                <button type="button" className="back-link" onClick={() => { setAuthStep('phone'); setAuthNotice(''); setOtp('') }}>← Change number</button>
              </form>
            )}
            {authNotice && <div className="auth-notice">{authNotice}</div>}
            <small className="auth-footnote">Demo mode can show the OTP locally. Real SMS/WhatsApp delivery will be connected later.</small>
          </section>
        </div>
      )}

      {bookingsOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => setBookingsOpen(false)}>
          <section className="bookings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="bookings-header"><div><span className="eyebrow">YOUR RIDES</span><h2>My bookings</h2></div><button className="auth-close" onClick={() => setBookingsOpen(false)}>×</button></div>
            {bookings.length ? <div className="booking-list">{bookings.map((item) => (
              <article className="history-card" key={item.id}>
                <div className="history-top"><strong>{item.rideName}</strong><span className={`status-pill status-${String(item.status).toLowerCase()}`}>{String(item.status).replaceAll('_',' ')}</span></div>
                <div className="history-route"><span>●</span><p>{item.pickup}</p><span>◆</span><p>{item.destination}</p></div>
                <div className="history-bottom"><span>{new Date(item.createdAt).toLocaleString()}</span><strong>₹{item.total}</strong></div>
                <small>Booking ID: {item.id}</small>
                
              </article>
            ))}</div> : <div className="empty-history"><div className="empty-icon">↗</div><h3>No bookings yet</h3><p>Your Rydex rides will appear here after your first booking.</p></div>}
          </section>
        </div>
      )}

      {trackingOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => setTrackingOpen(false)}>
          <section className="tracking-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="bookings-header"><div><span className="eyebrow">LIVE RIDE</span><h2>Track your driver</h2></div><button className="auth-close" onClick={() => setTrackingOpen(false)}>×</button></div>
            <RydexMap
              pickupCoords={tracking?.pickup?.lat && tracking?.pickup?.lng ? { pickupLat: tracking.pickup.lat, pickupLng: tracking.pickup.lng } : null}
              destinationCoords={tracking?.destination?.lat && tracking?.destination?.lng ? { destinationLat: tracking.destination.lat, destinationLng: tracking.destination.lng } : null}
              driverCoords={tracking?.driver}
            />
            <div className="tracking-summary">
              <div><span>Status</span><strong>{String(tracking?.status || trackingBooking?.status || 'LOADING').replaceAll('_',' ')}</strong></div>
              <div><span>Driver</span><strong>{tracking?.driver?.name || 'Finding driver…'}</strong></div>
              <div><span>Vehicle</span><strong>{tracking?.driver ? `${tracking.driver.vehicleType} · ${tracking.driver.vehicleNumber || 'Assigned'}` : 'Waiting for assignment'}</strong></div>
            </div>
            <div className="tracking-location">
              <span className="live-dot"></span>
              {tracking?.driver?.latitude ? `Live GPS · ${Number(tracking.driver.latitude).toFixed(5)}, ${Number(tracking.driver.longitude).toFixed(5)}` : 'Waiting for the driver to share a live location.'}
            </div>
            <p className="tracking-note">This is the live-tracking foundation. The map will use Google Maps when Maps/Places is connected.</p>
          </section>
        </div>
      )}

      {adminOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => setAdminOpen(false)}>
          <section className="bookings-modal provider-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="bookings-header"><div><span className="eyebrow">RYDEX OPERATIONS</span><h2>Admin Dashboard</h2></div><button className="auth-close" onClick={() => setAdminOpen(false)}>×</button></div>
            {!adminData ? (
              <div className="admin-access">
                <p>Enter the server-side admin token to access operations data.</p>
                <input className="auth-input" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="Admin token" />
                <button className="pay-btn auth-submit" onClick={loadAdminDashboard} disabled={adminLoading}>{adminLoading ? 'Loading…' : 'Open dashboard →'}</button>
              </div>
            ) : (
              <>
                <div className="provider-kpis">
                  <div><span>Users</span><strong>{adminData.users}</strong><small>Registered</small></div>
                  <div><span>Bookings</span><strong>{adminData.bookings}</strong><small>{adminData.active} active</small></div>
                  <div><span>Completed</span><strong>{adminData.completed}</strong><small>{adminData.cancelled} cancelled</small></div>
                </div>
                <div className="provider-kpis">
                  <div><span>Collected</span><strong>₹{adminData.revenue?.total ?? 0}</strong><small>Completed rides</small></div>
                  <div><span>Ride fares</span><strong>₹{adminData.revenue?.fare ?? 0}</strong><small>Provider fares</small></div>
                  <div><span>Rydex revenue</span><strong>₹{adminData.revenue?.platformFee ?? 0}</strong><small>Platform fees</small></div>
                </div>
                <div className="provider-section">
                  <div className="queue-title"><span>PROVIDER NETWORK</span><button className="refresh-btn" onClick={loadAdminProviders}>Refresh</button></div>
                  <div className="admin-provider-form">
                    <input placeholder="Company name" value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} />
                    <input placeholder="Provider code" value={providerForm.code} onChange={(e) => setProviderForm({ ...providerForm, code: e.target.value })} />
                    <select value={providerForm.integrationType} onChange={(e) => setProviderForm({ ...providerForm, integrationType: e.target.value })}><option>DEMO</option><option>BOOKING_LINK</option><option>API</option></select>
                    <input placeholder="Official booking URL" value={providerForm.bookingUrl} onChange={(e) => setProviderForm({ ...providerForm, bookingUrl: e.target.value })} />
                    <input placeholder="Cities, e.g. Bengaluru,Mysuru" value={providerForm.cities} onChange={(e) => setProviderForm({ ...providerForm, cities: e.target.value })} />
                    <input placeholder="Ride types" value={providerForm.rideTypes} onChange={(e) => setProviderForm({ ...providerForm, rideTypes: e.target.value })} />
                    <button className="pay-btn" onClick={saveAdminProvider}>Add provider +</button>
                  </div>
                  <div className="admin-provider-list">{adminProviders.map((provider) => <article className="history-card" key={provider.code}><div className="history-top"><strong>{provider.name}</strong><span className={provider.active ? 'status-pill status-completed' : 'status-pill status-cancelled'}>{provider.active ? 'ACTIVE' : 'OFF'}</span></div><div className="provider-request-meta"><span>{provider.code}</span><span>{provider.integrationType}</span></div><small>{provider.cities?.join(', ') || 'All cities'} · {provider.rideTypes?.join(', ') || 'All ride types'}</small><button className="refresh-btn" onClick={() => toggleAdminProvider(provider)}>{provider.active ? 'Deactivate' : 'Activate'}</button></article>)}</div>
                </div>
                <div className="provider-section">
                  <div className="queue-title"><span>RECENT BOOKINGS</span><button className="refresh-btn" onClick={loadAdminDashboard}>Refresh</button></div>
                  <div className="booking-list">{(adminData.recent || []).map((item) => (
                    <article className="history-card" key={item.id}>
                      <div className="history-top"><strong>{item.rideName}</strong><span className={`status-pill status-${String(item.status).toLowerCase()}`}>{String(item.status).replaceAll('_',' ')}</span></div>
                      <div className="history-route"><span>●</span><p>{item.pickup}</p><span>◆</span><p>{item.destination}</p></div>
                      <div className="history-bottom"><span>{new Date(item.createdAt).toLocaleString()}</span><strong>₹{item.total}</strong></div>
                    </article>
                  ))}</div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {providerPortalOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => setProviderPortalOpen(false)}>
          <section className="bookings-modal provider-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="bookings-header">
              <div><span className="eyebrow">RYDEX PARTNER NETWORK</span><h2>Become a Rydex Provider</h2></div>
              <button className="auth-close" onClick={() => setProviderPortalOpen(false)}>×</button>
            </div>
            <div className="partner-hero">
              <div className="partner-icon">◆</div>
              <h3>Bring your rides to more customers.</h3>
              <p>Rydex compares authorized ride providers side by side. You keep the customer relationship, booking flow and payment. Rydex sends customers to you.</p>
            </div>
            <div className="provider-kpis">
              <div><span>Comparison</span><strong>✓</strong><small>Prices & ETAs</small></div>
              <div><span>Customer</span><strong>→</strong><small>Sent to provider</small></div>
              <div><span>Booking</span><strong>API</strong><small>Authorized only</small></div>
            </div>
            <div className="provider-section">
              <div className="queue-title"><span>INTEGRATION OPTIONS</span></div>
              <div className="partner-options">
                <article><strong>🔗 Official booking link</strong><p>Send customers directly to your official booking or deep-link flow.</p></article>
                <article><strong>⚡ Authorized API</strong><p>Share quotes, ETAs and ride types through an approved partner integration.</p></article>
                <article><strong>📊 Partner analytics</strong><p>Track comparison visibility, provider selections and handoff performance.</p></article>
              </div>
            </div>
            <div className="provider-section">
              <div className="queue-title"><span>DEMO PARTNER CONFIGURATION</span></div>
              <div className="provider-access-row">
                <div><label>Partner code</label><input value={providerCode} onChange={(event) => setProviderCode(event.target.value)} placeholder="your-company" /></div>
                <div><label>Integration status</label><input value="Not connected" readOnly /></div>
              </div>
              <p className="provider-footer-note">No provider API or private app endpoint is accessed without authorization. Once a partnership is approved, we can connect the provider's official API or booking URL here.</p>
            </div>
            <div className="partner-apply-form">
  <h3>Partner application</h3>
  <input placeholder="Company name *" value={partnerForm.companyName} onChange={e => setPartnerForm({...partnerForm, companyName:e.target.value})}/>
  <input placeholder="Contact person *" value={partnerForm.contactName} onChange={e => setPartnerForm({...partnerForm, contactName:e.target.value})}/>
  <input placeholder="Business email *" type="email" value={partnerForm.email} onChange={e => setPartnerForm({...partnerForm, email:e.target.value})}/>
  <input placeholder="Phone number" value={partnerForm.phone} onChange={e => setPartnerForm({...partnerForm, phone:e.target.value})}/>
  <input placeholder="Website" value={partnerForm.website} onChange={e => setPartnerForm({...partnerForm, website:e.target.value})}/>
  <input placeholder="Cities served" value={partnerForm.cities} onChange={e => setPartnerForm({...partnerForm, cities:e.target.value})}/>
  <input placeholder="Ride types: auto,bike,cab" value={partnerForm.rideTypes} onChange={e => setPartnerForm({...partnerForm, rideTypes:e.target.value})}/>
  <select value={partnerForm.integrationType} onChange={e => setPartnerForm({...partnerForm, integrationType:e.target.value})}><option value="BOOKING_LINK">Official booking link</option><option value="API">Authorized API</option></select>
  <textarea placeholder="Anything we should know?" value={partnerForm.notes} onChange={e => setPartnerForm({...partnerForm, notes:e.target.value})}/>
  <button className="pay-btn" onClick={submitPartnerApplication}>Submit partnership application →</button>
</div>
          </section>
        </div>
      )}

      {driverConsoleOpen && (
        <div className="auth-backdrop" role="presentation" onClick={() => setDriverConsoleOpen(false)}>
          <section className="bookings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="bookings-header"><div><span className="eyebrow">PROVIDER MODE</span><h2>Driver console</h2></div><button className="auth-close" onClick={() => setDriverConsoleOpen(false)}>×</button></div>
            {!driverId ? (
              <div className="empty-history"><div className="empty-icon">🚕</div><h3>Driver demo</h3><p>Register a test driver to preview how providers receive and accept paid rides.</p><button className="pay-btn" onClick={registerDemoDriver}>Register demo driver →</button></div>
            ) : (
              <>
                <div className="driver-status"><div><strong>Rydex Demo Driver</strong><span>Cab · KA01RYDEX</span></div><button className={`availability-btn ${driverAvailable ? 'on' : ''}`} onClick={toggleDriverAvailability}>{driverAvailable ? '● Available' : '○ Offline'}</button></div>
                {driverRide && (
                  <article className="history-card active-ride-card">
                    <div className="history-top"><strong>ACTIVE RIDE</strong><span className="status-pill status-driver_assigned">{String(driverRide.status).replaceAll('_',' ')}</span></div>
                    <div className="history-route"><span>●</span><p>{driverRide.pickup}</p><span>◆</span><p>{driverRide.destination}</p></div>
                    <div className="ride-actions">
                      {driverRide.status === 'DRIVER_ASSIGNED' && <button className="pay-btn" onClick={() => updateDriverRideStatus('IN_PROGRESS')}>Start ride →</button>}
                      {driverRide.status === 'IN_PROGRESS' && <button className="pay-btn" onClick={() => updateDriverRideStatus('COMPLETED')}>Complete ride ✓</button>}
                    </div>
                  </article>
                )}
                <div className="queue-title"><span>CONFIRMED RIDE REQUESTS</span><button className="refresh-btn" onClick={() => { loadDriverQueue(); loadDriverRide() }}>Refresh</button></div>
                {driverBookings.length ? <div className="booking-list">{driverBookings.map((item) => (
                  <article className="history-card" key={item.id}>
                    <div className="history-top"><strong>{item.rideName}</strong><strong>₹{item.total}</strong></div>
                    <div className="history-route"><span>●</span><p>{item.pickup}</p><span>◆</span><p>{item.destination}</p></div>
                    <button className="pay-btn" disabled={!driverAvailable || driverRide} onClick={() => acceptDriverBooking(item.id)}>{driverRide ? 'Finish current ride first' : driverAvailable ? 'Accept ride →' : 'Driver offline'}</button>
                  </article>
                ))}</div> : !driverRide && <div className="empty-history"><h3>No confirmed requests</h3><p>Paid rides waiting for a driver will appear here.</p></div>}
              </>
            )}
          </section>
        </div>
      )}

      <footer id="support">
        <span>© 2026 Rydex</span>
        <span>Compare. Choose. Ride.</span>
        <span>Backend connected · Payment integration next</span>
      </footer>
    </div>
  )
}

export default App
