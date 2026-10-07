import { useMemo, useState } from 'react'
import './App.css'

const rideOptions = [
  { id: 'auto', icon: '🛺', name: 'Auto', provider: 'Rydex Partner', eta: 4, fare: 180, seats: '1–3' },
  { id: 'bike', icon: '🏍️', name: 'Bike', provider: 'Rydex Partner', eta: 3, fare: 125, seats: '1' },
  { id: 'cab', icon: '🚕', name: 'Cab', provider: 'Rydex Partner', eta: 6, fare: 290, seats: '1–4' },
  { id: 'premium', icon: '🚘', name: 'Premium', provider: 'Rydex Partner', eta: 8, fare: 420, seats: '1–4' },
]

function App() {
  const [pickup, setPickup] = useState('')
  const [destination, setDestination] = useState('')
  const [searched, setSearched] = useState(false)
  const [sort, setSort] = useState('recommended')
  const [selected, setSelected] = useState(null)

  const rides = useMemo(() => {
    const list = [...rideOptions]
    if (sort === 'price') return list.sort((a, b) => a.fare - b.fare)
    if (sort === 'eta') return list.sort((a, b) => a.eta - b.eta)
    return list
  }, [sort])

  const searchRides = (event) => {
    event.preventDefault()
    if (pickup.trim() && destination.trim()) {
      setSearched(true)
      setSelected(null)
    }
  }

  const total = selected ? selected.fare + 8 : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); setSearched(false); setSelected(null) }}>
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
                <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Enter pickup location" />
              </div>
            </div>
            <div className="route-line" />
            <div className="location-field">
              <span className="field-icon destination-pin">◆</span>
              <div>
                <label>Destination</label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Where are you going?" />
              </div>
            </div>
            <button className="search-btn" type="submit">Search rides <span>→</span></button>
          </form>

          <div className="trust-row">
            <span>✓ Compare prices</span>
            <span>✓ One checkout</span>
            <span>✓ Transparent ₹8 platform fee</span>
          </div>
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
                {rides.map((ride, index) => (
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
                    <button className="select-btn" onClick={() => setSelected(ride)}>
                      {selected?.id === ride.id ? 'Selected' : 'Select'}
                    </button>
                  </article>
                ))}
              </div>

              <aside className="checkout-card">
                {selected ? (
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
                    <div className="price-breakdown">
                      <div><span>Ride fare</span><strong>₹{selected.fare}</strong></div>
                      <div><span>Rydex platform fee</span><strong>₹8</strong></div>
                      <hr />
                      <div className="total"><span>Total</span><strong>₹{total}</strong></div>
                    </div>
                    <button className="pay-btn" onClick={() => alert(`Demo checkout: ₹${total}. Payment gateway will be connected next.`)}>
                      Continue to payment <span>→</span>
                    </button>
                    <p className="demo-note">Demo booking · live partner pricing will be connected later</p>
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
        <span>Demo MVP · Partner integrations coming next</span>
      </footer>
    </div>
  )
}

export default App
