import { useEffect, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }

function RydexMap({ pickupCoords, destinationCoords, driverCoords, onPlaceSelected }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markers = useRef({})
  const routePolylines = useRef([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [placeInput, setPlaceInput] = useState('')

  useEffect(() => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!key) {
      setError('Add VITE_GOOGLE_MAPS_API_KEY to enable the live Google map.')
      return undefined
    }

    let cancelled = false
    const init = async () => {
      try {
        setOptions({ key, v: 'weekly' })
        const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
          importLibrary('maps'),
          importLibrary('marker'),
        ])
        if (cancelled || !mapRef.current) return
        mapInstance.current = new Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          mapId: 'DEMO_MAP_ID',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        markers.current.AdvancedMarkerElement = AdvancedMarkerElement
        setReady(true)
      } catch (e) {
        setError(e.message || 'Unable to load Google Maps.')
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready || !mapInstance.current) return
    const map = mapInstance.current
    const AdvancedMarkerElement = markers.current.AdvancedMarkerElement

    Object.values(markers.current).forEach((marker) => {
      if (marker && marker !== AdvancedMarkerElement && marker.map) marker.map = null
    })
    markers.current = { AdvancedMarkerElement }

    const points = [
      pickupCoords && {
        key: 'pickup',
        position: { lat: Number(pickupCoords.pickupLat), lng: Number(pickupCoords.pickupLng) },
        title: 'Pickup',
      },
      destinationCoords && {
        key: 'destination',
        position: { lat: Number(destinationCoords.destinationLat), lng: Number(destinationCoords.destinationLng) },
        title: 'Destination',
      },
      driverCoords && Number.isFinite(Number(driverCoords.latitude)) && {
        key: 'driver',
        position: { lat: Number(driverCoords.latitude), lng: Number(driverCoords.longitude) },
        title: 'Driver',
      },
    ].filter(Boolean).filter((point) => Number.isFinite(point.position.lat) && Number.isFinite(point.position.lng))

    const bounds = new google.maps.LatLngBounds()
    points.forEach(({ key, position, title }) => {
      const marker = new AdvancedMarkerElement({ map, position, title })
      markers.current[key] = marker
      bounds.extend(position)
    })

    if (points.length === 1) map.setCenter(points[0].position)
    if (points.length > 1) map.fitBounds(bounds, 70)

    const drawRoute = async () => {
      if (!pickupCoords || !destinationCoords) return
      try {
        const { Route } = await importLibrary('routes')
        routePolylines.current.forEach((polyline) => polyline.setMap(null))
        routePolylines.current = []
        const { routes } = await Route.computeRoutes({
          origin: { lat: Number(pickupCoords.pickupLat), lng: Number(pickupCoords.pickupLng) },
          destination: { lat: Number(destinationCoords.destinationLat), lng: Number(destinationCoords.destinationLng) },
          travelMode: 'DRIVING',
          routingPreference: 'TRAFFIC_AWARE',
          fields: ['path'],
        })
        if (routes?.[0]) {
          routePolylines.current = routes[0].createPolylines({ polylineOptions: { strokeWeight: 5 } })
          routePolylines.current.forEach((polyline) => polyline.setMap(map))
        }
      } catch {
        // The map and markers remain usable if routing is unavailable.
      }
    }

    drawRoute()
  }, [ready, pickupCoords?.pickupLat, pickupCoords?.pickupLng, destinationCoords?.destinationLat, destinationCoords?.destinationLng, driverCoords?.latitude, driverCoords?.longitude])

  const searchPlace = async (event) => {
    event.preventDefault()
    if (!placeInput.trim() || !ready) return

    try {
      const { AutocompleteSuggestion } = await importLibrary('places')
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: placeInput.trim(),
        includedRegionCodes: ['in'],
      })
      const prediction = suggestions?.[0]?.placePrediction
      if (!prediction) throw new Error('No matching place found.')

      const place = prediction.toPlace()
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })
      if (!place.location) throw new Error('Place has no location.')

      onPlaceSelected?.({
        name: place.displayName || place.formattedAddress || placeInput,
        lat: place.location.lat(),
        lng: place.location.lng(),
      })
      mapInstance.current.setCenter(place.location)
      mapInstance.current.setZoom(15)
      setPlaceInput('')
      setError('')
    } catch (e) {
      setError(e.message || 'Place search failed.')
    }
  }

  return (
    <div className="real-map-wrap">
      {ready && (
        <form className="map-search" onSubmit={searchPlace}>
          <input value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} placeholder="Search MG Road, airport, hotel…" />
          <button type="submit">Search</button>
        </form>
      )}
      <div ref={mapRef} className="real-map" />
      {error && <div className="map-fallback">{error}</div>}
    </div>
  )
}

export default RydexMap
