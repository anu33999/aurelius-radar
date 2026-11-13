/**
 * International target markets (business districts) used for the directory, OSM discovery and the
 * global map. Coordinates are approximate city-centre / CBD points, good enough to centre a search
 * radius. Add or edit entries freely; anything not listed can be imported with "Import any city".
 */
export type Region = "North America" | "Europe" | "Middle East" | "Asia-Pacific" | "Oceania" | "Africa" | "Latin America" | "India";

export interface Hub {
  /** City / business-district name shown in the UI (stored as Business.city). */
  name: string;
  country: string;
  region: Region;
  lat: number;
  lng: number;
  radiusM: number;
  /** IANA time zone, for the directory's world clock (every preset market has one; geocoded cities don't). */
  tz?: string;
}

export const HUBS: Hub[] = [
  // North America
  { name: "New York", country: "United States", region: "North America", lat: 40.7549, lng: -73.984, radiusM: 3000, tz: "America/New_York" },
  { name: "San Francisco", country: "United States", region: "North America", lat: 37.7897, lng: -122.4, radiusM: 3000, tz: "America/Los_Angeles" },
  { name: "Austin", country: "United States", region: "North America", lat: 30.2672, lng: -97.7431, radiusM: 3000, tz: "America/Chicago" },
  { name: "Los Angeles", country: "United States", region: "North America", lat: 34.0522, lng: -118.2437, radiusM: 3500, tz: "America/Los_Angeles" },
  { name: "Miami", country: "United States", region: "North America", lat: 25.7617, lng: -80.1918, radiusM: 3000, tz: "America/New_York" },
  { name: "Chicago", country: "United States", region: "North America", lat: 41.8819, lng: -87.6278, radiusM: 3000, tz: "America/Chicago" },
  { name: "Toronto", country: "Canada", region: "North America", lat: 43.6532, lng: -79.3832, radiusM: 3000, tz: "America/Toronto" },
  { name: "Vancouver", country: "Canada", region: "North America", lat: 49.2827, lng: -123.1207, radiusM: 3000, tz: "America/Vancouver" },
  // Europe
  { name: "London", country: "United Kingdom", region: "Europe", lat: 51.5074, lng: -0.1278, radiusM: 3500, tz: "Europe/London" },
  { name: "Manchester", country: "United Kingdom", region: "Europe", lat: 53.4808, lng: -2.2426, radiusM: 3000, tz: "Europe/London" },
  { name: "Dublin", country: "Ireland", region: "Europe", lat: 53.3498, lng: -6.2603, radiusM: 3000, tz: "Europe/Dublin" },
  { name: "Amsterdam", country: "Netherlands", region: "Europe", lat: 52.3676, lng: 4.9041, radiusM: 3000, tz: "Europe/Amsterdam" },
  { name: "Berlin", country: "Germany", region: "Europe", lat: 52.52, lng: 13.405, radiusM: 3500, tz: "Europe/Berlin" },
  // Middle East
  { name: "Dubai", country: "United Arab Emirates", region: "Middle East", lat: 25.2048, lng: 55.2708, radiusM: 4000, tz: "Asia/Dubai" },
  { name: "Abu Dhabi", country: "United Arab Emirates", region: "Middle East", lat: 24.4539, lng: 54.3773, radiusM: 3500, tz: "Asia/Dubai" },
  // Asia-Pacific
  { name: "Singapore", country: "Singapore", region: "Asia-Pacific", lat: 1.2803, lng: 103.85, radiusM: 3500, tz: "Asia/Singapore" },
  // Oceania
  { name: "Sydney", country: "Australia", region: "Oceania", lat: -33.8688, lng: 151.2093, radiusM: 3000, tz: "Australia/Sydney" },
  { name: "Melbourne", country: "Australia", region: "Oceania", lat: -37.8136, lng: 144.9631, radiusM: 3000, tz: "Australia/Melbourne" },
  { name: "Auckland", country: "New Zealand", region: "Oceania", lat: -36.8485, lng: 174.7633, radiusM: 3000, tz: "Pacific/Auckland" },
  // India (affluent commercial districts; radius covers the main hubs of each city)
  { name: "Hyderabad", country: "India", region: "India", lat: 17.4239, lng: 78.401, radiusM: 6000, tz: "Asia/Kolkata" },
  { name: "Mumbai", country: "India", region: "India", lat: 19.0653, lng: 72.857, radiusM: 5500, tz: "Asia/Kolkata" },
  { name: "Bengaluru", country: "India", region: "India", lat: 12.954, lng: 77.635, radiusM: 5500, tz: "Asia/Kolkata" },
  { name: "Delhi NCR", country: "India", region: "India", lat: 28.6139, lng: 77.209, radiusM: 6500, tz: "Asia/Kolkata" },
  { name: "Pune", country: "India", region: "India", lat: 18.5314, lng: 73.8446, radiusM: 5000, tz: "Asia/Kolkata" },
  { name: "Chennai", country: "India", region: "India", lat: 13.0418, lng: 80.2341, radiusM: 5000, tz: "Asia/Kolkata" },
  { name: "Goa", country: "India", region: "India", lat: 15.4909, lng: 73.8278, radiusM: 6000, tz: "Asia/Kolkata" },
  { name: "Jaipur", country: "India", region: "India", lat: 26.9124, lng: 75.7873, radiusM: 5000, tz: "Asia/Kolkata" },
  // Africa
  { name: "Cape Town", country: "South Africa", region: "Africa", lat: -33.9249, lng: 18.4241, radiusM: 3000, tz: "Africa/Johannesburg" },
];

export const HUB_NAMES = HUBS.map((h) => h.name);
export const REGIONS: Region[] = [...new Set(HUBS.map((h) => h.region))];
export const COUNTRIES: string[] = [...new Set(HUBS.map((h) => h.country))].sort();

/** Nearest market within its radius (or null). */
export function nearestHub(lat: number, lng: number): Hub | null {
  let best: { hub: Hub; d: number } | null = null;
  for (const hub of HUBS) {
    const d = haversineM(lat, lng, hub.lat, hub.lng);
    if (d <= hub.radiusM * 1.3 && (!best || d < best.d)) best = { hub, d };
  }
  return best?.hub ?? null;
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
