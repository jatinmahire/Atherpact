/**
 * Real haversine distance in km — the same formula the backend's
 * distance_score already uses server-side (services/matcher.py). This
 * mirrors it client-side purely for a human-readable "X km away" label
 * next to the existing 0-1 distance score, using the same real
 * coordinates already on screen. Computes nothing new the backend
 * doesn't already base its score on.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
}
