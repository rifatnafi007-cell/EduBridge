import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "@tanstack/react-router";
import { formatTaka } from "@/lib/edubridge";
import { formatDistance, type Coordinates } from "@/lib/geo";
import { cn } from "@/lib/utils";

export interface MapTutor {
  id: string;
  name: string;
  avatarUrl?: string | null | undefined;
  subjects: string[];
  hourlyRate: number | string;
  avgRating: number | string;
  totalReviews: number;
  lat: number;
  lng: number;
  distanceKm?: number | null | undefined;
  address?: string | null | undefined;
}

interface TutorMapProps {
  tutors: MapTutor[];
  userLocation: Coordinates | null;
  radiusKm?: number;
  selectedTutorId?: string | null;
  onSelectTutor?: (tutorId: string) => void;
  className?: string;
}

export function TutorMap({
  tutors,
  userLocation,
  radiusKm,
  selectedTutorId,
  onSelectTutor,
  className = "h-[500px] w-full rounded-2xl overflow-hidden border border-border shadow-sm",
}: TutorMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center to user location or Dhaka
    const centerLat = userLocation?.lat ?? 23.8103;
    const centerLng = userLocation?.lng ?? 90.4125;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: userLocation ? 13 : 12,
      zoomControl: true,
      attributionControl: false,
    });

    // Clean OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;

    // Handle container resize (e.g., orientation change or responsive toggle)
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers, radius circle, and center whenever tutors or userLocation changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // 1. Render User GPS Location Marker & Radius Circle
    if (userLocation) {
      // Pulsing user location dot
      const userIcon = L.divIcon({
        className: "custom-user-marker",
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute h-6 w-6 rounded-full bg-blue-500 opacity-30 animate-ping"></span>
            <span class="relative h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-md"></span>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(markersGroup);

      userMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; padding: 2px;">
          <strong style="color: #2563eb;">📍 Your Search Location</strong>
          <p style="margin: 2px 0 0 0; color: #64748b;">Distance measured from here</p>
        </div>
      `);

      // Radius circle
      if (radiusKm && radiusKm > 0) {
        if (radiusCircleRef.current) {
          radiusCircleRef.current.remove();
        }
        radiusCircleRef.current = L.circle([userLocation.lat, userLocation.lng], {
          radius: radiusKm * 1000,
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.08,
          weight: 1.5,
          dashArray: "4, 6",
        }).addTo(map);
      }
    } else if (radiusCircleRef.current) {
      radiusCircleRef.current.remove();
      radiusCircleRef.current = null;
    }

    // 2. Render Tutor Markers
    const bounds: L.LatLngTuple[] = [];
    if (userLocation) {
      bounds.push([userLocation.lat, userLocation.lng]);
    }

    for (const tutor of tutors) {
      bounds.push([tutor.lat, tutor.lng]);
      const isSelected = selectedTutorId === tutor.id;

      // Modern SVG Pin
      const tutorIcon = L.divIcon({
        className: "custom-tutor-marker",
        html: `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 12px;
            background: ${isSelected ? "#10b981" : "#4f46e5"};
            color: #ffffff;
            font-weight: 700;
            font-size: 12px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            border: 2px solid #ffffff;
            cursor: pointer;
            transition: transform 0.2s;
          ">
            ${tutor.name.slice(0, 2).toUpperCase()}
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 38],
      });

      const marker = L.marker([tutor.lat, tutor.lng], { icon: tutorIcon }).addTo(
        markersGroup,
      );

      const distanceText =
        typeof tutor.distanceKm === "number"
          ? `<p style="margin: 4px 0; color: #059669; font-weight: 600; font-size: 11px;">📍 ${formatDistance(
              tutor.distanceKm,
            )}</p>`
          : "";

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 170px; padding: 4px;">
          <strong style="font-size: 14px; color: #1e293b;">${tutor.name}</strong>
          ${distanceText}
          <div style="margin: 4px 0; display: flex; flex-wrap: wrap; gap: 4px;">
            ${tutor.subjects
              .slice(0, 3)
              .map(
                (s) =>
                  `<span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #475569;">${s}</span>`,
              )
              .join("")}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
            <strong style="color: #0f172a; font-size: 14px;">${formatTaka(
              tutor.hourlyRate,
            )}</strong>
            <a href="/student/tutor/${tutor.id}" style="
              background: #10B981;
              color: white;
              padding: 4px 10px;
              border-radius: 6px;
              text-decoration: none;
              font-size: 11px;
              font-weight: 600;
              box-shadow: 0 1px 2px rgba(16, 185, 129, 0.3);
            ">View & Book</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on("click", () => {
        onSelectTutor?.(tutor.id);
      });

      if (isSelected) {
        marker.openPopup();
      }
    }

    // Fit map bounds if tutors exist
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1 && bounds[0]) {
      map.setView(bounds[0], 14);
    }
  }, [tutors, userLocation, radiusKm, selectedTutorId, onSelectTutor]);

  return (
    <div className={cn("relative z-0 isolate overflow-hidden rounded-2xl border border-border shadow-sm", className)}>
      <div ref={mapContainerRef} className="h-full w-full relative z-0" />
    </div>
  );
}
