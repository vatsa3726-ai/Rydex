import { useMemo, useState } from 'react'
import './App.css'

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
  const [searched, setSearched] = useState(false)
  const [sort, setSort] = useState('recommended')
  const [rides, setRides] = useState(demoRides)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [apiNotice, setApiNotice] = useState('')
  const [booking, setBooking] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [phone, setPhone] = useState('')

  const sortedRides = useMemo(() => {
    const list = [...rides]
    if (sort === 'price') return list.sort((a, b) => a.fare - b.fare)
    if (sort === 'eta') return list.sort((a, b) => a.eta - b.eta)
    return list
  }, [rides, sort])

  const searchRides = async (event) => {
    event.preventDefault()
    if (!pickup.trim() || !destination.trim()) return

    setLoading(true)
    setApiNotice('')
    setBooking(null)

    try {
      const response = await fetch(`${API_URL}/rides/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          destination,
          ...(pickupCoords || {}),
          ...(destinationCoords || {}),
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
        headers: { 'Content-Type': 'application/json' },
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
        theme: { color: '#19b978' },
        handler: async (payment) => {
          try {
            const verify = await fetch(`${API_URL}/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    if (!/^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s+/g, ''))) {
      setApiNotice('Please enter a valid mobile number before booking.')
      return
    }

    setLoading(true)
    setApiNotice('')

    try {
      const response = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          destination,
          rideId: selected.id,
          rideName: selected.name,
          fare: selected.fare,
          phone,
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

  const total = selected ? selected.fare + 8 : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setSearched(false); setSelected(null); setBooking(null) }}>
          <span className="brand-mark">R</span>
          <span>RYDEX</span>
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#support">Support</a>
          <button className="login-btn">Sign in</button>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">ONE SEARCH. EVERY RIDE.</span>
            <h1>Compare rides.<br /><span>Choose smarter.</span></h1>
            <p>Find the best auto, bike and cab options in one place. No jumping between apps.</p>
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

        {searched && (
          <section className="results-section">
            <div className="results-head">
              <div>
                <span className="eyebrow">RIDE OPTIONS</span>
                <h2>{pickup} <span>→</span> {destination}</h2>
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

            <div className="results-grid">
              <div className="ride-list">
                {sortedRides.map((ride, index) => (
                  <article className={`ride-card ${selected?.id === ride.id ? 'selected' : ''}`} key={ride.id}>
                    <div className="ride-icon">{ride.icon}</div>
                    <div className="ride-main">
                      <div className="ride-title">
                        <h3>{ride.name}</h3>
                        {index === 0 && <span className="best-badge">BEST VALUE</span>}
                      </div>
                      <p>{ride.provider} · {ride.seats} seats · Pickup in {ride.eta} min</p>
                    </div>
                    <div className="ride-price">
                      <strong>₹{ride.fare + 8}</strong>
                      <span>incl. ₹8 fee</span>
                    </div>
                    <button className="select-btn" onClick={() => { setSelected(ride); setBooking(null) }}>
                      {selected?.id === ride.id ? 'Selected' : 'Select'}
                    </button>
                  </article>
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
                            const response = await fetch(`${API_URL}/bookings/${booking.id}/cancel`, { method: 'POST' })
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
                      <div><span>Ride fare</span><strong>₹{selected.fare}</strong></div>
                      <div><span>Rydex platform fee</span><strong>₹8</strong></div>
                      <hr />
                      <div className="total"><span>Total</span><strong>₹{total}</strong></div>
                    </div>
                    <button className="pay-btn" onClick={createBooking} disabled={loading}>
                      {loading ? 'Creating booking…' : 'Continue to payment'} <span>→</span>
                    </button>
                    <p className="demo-note">First step creates the booking. The next screen opens Razorpay only when test credentials are configured.</p>
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
            <div><span>03</span><h3>Book</h3><p>Use one Rydex checkout with a simple ₹8 platform fee.</p></div>
          </section>
        )}
      </main>

      <footer id="support">
        <span>© 2026 Rydex</span>
        <span>Compare. Choose. Ride.</span>
        <span>Backend connected · Payment integration next</span>
      </footer>
    </div>
  )
}

export default App
