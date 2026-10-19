/**
 * Geographic utility functions for Haversine distance, geolocation, and area coordinate mapping.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface AreaLocation {
  name: string;
  lat: number;
  lng: number;
  division: string;
}

// Major hubs in Dhaka and Bangladesh for home tuition
export const BANGLADESH_AREAS: Record<string, AreaLocation> = {
  dhanmondi: { name: "Dhanmondi", lat: 23.7461, lng: 90.3742, division: "Dhaka" },
  mirpur: { name: "Mirpur", lat: 23.8067, lng: 90.3683, division: "Dhaka" },
  uttara: { name: "Uttara", lat: 23.8759, lng: 90.3795, division: "Dhaka" },
  gulshan: { name: "Gulshan", lat: 23.7925, lng: 90.4078, division: "Dhaka" },
  banani: { name: "Banani", lat: 23.7937, lng: 90.4043, division: "Dhaka" },
  mohammadpur: { name: "Mohammadpur", lat: 23.7658, lng: 90.3584, division: "Dhaka" },
  bashundhara: { name: "Bashundhara R/A", lat: 23.8191, lng: 90.4326, division: "Dhaka" },
  badda: { name: "Badda / Rampura", lat: 23.7805, lng: 90.4267, division: "Dhaka" },
  farmgate: { name: "Farmgate / Tejgaon", lat: 23.757, lng: 90.3888, division: "Dhaka" },
  lalbagh: { name: "Lalbagh / Old Dhaka", lat: 23.7188, lng: 90.3881, division: "Dhaka" },
  khilgaon: { name: "Khilgaon / Malibagh", lat: 23.7516, lng: 90.4206, division: "Dhaka" },
  motijheel: { name: "Motijheel", lat: 23.733, lng: 90.4172, division: "Dhaka" },
  chittagong: { name: "Chittagong City", lat: 22.3569, lng: 91.7832, division: "Chittagong" },
  sylhet: { name: "Sylhet City", lat: 24.8949, lng: 91.8687, division: "Sylhet" },
  rajshahi: { name: "Rajshahi City", lat: 24.3745, lng: 88.6042, division: "Rajshahi" },
};

export const DEFAULT_CENTER: Coordinates = {
  lat: 23.8103,
  lng: 90.4125, // Center of Dhaka
};

/**
 * Calculates great-circle distance between two GPS coordinates using the Haversine formula.
 * @returns Distance in kilometers
 */
export function calculateDistanceKm(
  coord1: Coordinates,
  coord2: Coordinates,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Formats a distance into a friendly display string (e.g. "800 m away", "2.4 km away").
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `${meters} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

/**
 * Auto-geocodes a text address by checking known area keywords in Bangladesh.
 */
export function geocodeAddress(address?: string | null): Coordinates | null {
  if (!address) return null;
  const lower = address.toLowerCase();

  for (const [key, loc] of Object.entries(BANGLADESH_AREAS)) {
    if (lower.includes(key) || lower.includes(loc.name.toLowerCase())) {
      return { lat: loc.lat, lng: loc.lng };
    }
  }

  // Default fallback for general Dhaka addresses
  if (lower.includes("dhaka")) {
    return { lat: 23.7771, lng: 90.3994 };
  }

  return null;
}

/**
 * Resolves a tutor's coordinates from their profile:
 * 1. Uses explicit `latitude` and `longitude` if set in `tutor_profiles`
 * 2. Fallbacks to keyword geocoding the tutor's address in `profiles`
 */
export function getTutorCoordinates(tutor: {
  latitude?: number | null;
  longitude?: number | null;
  profiles?: { address?: string | null } | null;
}): Coordinates | null {
  if (
    typeof tutor.latitude === "number" &&
    typeof tutor.longitude === "number" &&
    !isNaN(tutor.latitude) &&
    !isNaN(tutor.longitude) &&
    tutor.latitude !== 0 &&
    tutor.longitude !== 0
  ) {
    return { lat: tutor.latitude, lng: tutor.longitude };
  }

  return geocodeAddress(tutor.profiles?.address);
}

/**
 * Gets the user's current GPS location via HTML5 Geolocation API.
 */
export function getUserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        let msg = "Could not retrieve your location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission denied. Please allow location access in your browser.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location information is unavailable.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out.";
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}
