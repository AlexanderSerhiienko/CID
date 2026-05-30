"use client";

import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { Layer } from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import { feature } from "topojson-client";
import countriesTopology from "world-atlas/countries-50m.json";
import {
  MapRiskEvent,
  normalizeCountryName,
  riskLookup,
  riskLegend,
} from "@/lib/map/risk-scale";

type CountryFeature = Feature<Geometry, { name?: string }>;

const severityColor: Record<string, string> = {
  CRITICAL: "#f87171",
  HIGH:     "#ffb786",
  MEDIUM:   "#fbbf24",
  LOW:      "#4edea3",
};

/**
 * Normalize a polygon ring so no consecutive longitude jump exceeds 180°.
 *
 * Leaflet renders polygons by drawing straight screen-space lines between
 * consecutive coordinate pairs. When a polygon crosses the antimeridian
 * (±180°), the raw GeoJSON longitude jumps from e.g. +179° to -179° —
 * a difference of 358°. Leaflet interprets this as "draw a line across
 * the entire map width", producing the horizontal stripe artifact visible
 * with Russia. Offsetting subsequent coordinates by ±360° makes the ring
 * geometrically continuous so Leaflet renders it correctly.
 */
function normalizeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const result: Position[] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prevLon = result[i - 1][0];
    let lon = ring[i][0];
    const rest = ring[i].slice(1);
    while (lon - prevLon > 180) lon -= 360;
    while (prevLon - lon > 180) lon += 360;
    result.push([lon, ...rest]);
  }
  return result;
}

function normalizeGeometry(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return { ...geometry, coordinates: geometry.coordinates.map(normalizeRing) };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((poly) => poly.map(normalizeRing))
    };
  }
  return geometry;
}

const rawFeatures = feature(
  countriesTopology as never,
  (countriesTopology as { objects: { countries: unknown } }).objects.countries as never
) as unknown as FeatureCollection<Geometry, { name?: string }>;

// Apply antimeridian normalization once at module load — no runtime cost per render.
const countryFeatures: FeatureCollection<Geometry, { name?: string }> = {
  ...rawFeatures,
  features: rawFeatures.features.map((f) => ({
    ...f,
    geometry: normalizeGeometry(f.geometry)
  }))
};

export function EventMap({ events }: { events: MapRiskEvent[] }) {
  // Precise coords (GeoRSS ≥0.9, Nominatim 0.75, city dict 0.85) → point marker.
  // Country-centroid only (0.65) → choropleth fill.
  const PRECISE_THRESHOLD = 0.75;
  const preciseEvents = events.filter(
    (e) => e.locationConfidence >= PRECISE_THRESHOLD && e.latitude !== null && e.longitude !== null
  );
  const countryEvents = events.filter((e) => e.locationConfidence < PRECISE_THRESHOLD);

  const countries = riskLookup(countryEvents);

  return (
    <div className="relative h-full overflow-hidden">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        maxBounds={[[-85, -220], [85, 220]]}
        maxBoundsViscosity={0.6}
        minZoom={2}
        maxZoom={10}
        className="h-full"
        style={{ background: "#0b0e15" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        {/* Choropleth layer — country-level events only */}
        <GeoJSON
          data={countryFeatures}
          style={(country) => {
            const point = country ? countries.get(featureKey(country as CountryFeature)) : null;
            return {
              color: point ? "#f8fafc" : "#475569",
              fillColor: point?.color ?? "#1f2937",
              fillOpacity: point ? 0.72 : 0.2,
              opacity: point ? 0.85 : 0.35,
              weight: point ? 0.8 : 0.45
            };
          }}
          onEachFeature={(country, layer) => bindCountryPopup(country as CountryFeature, layer, countries)}
        />

        {/* Precise-coordinate point markers (GeoRSS / Nominatim / city dict) */}
        {preciseEvents.map((event) => (
          <CircleMarker
            key={event.id}
            center={[event.latitude as number, event.longitude as number]}
            radius={7}
            pathOptions={{
              color: "#0b0e15",
              weight: 1.5,
              fillColor: severityColor[event.severity] ?? "#8c909f",
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <strong>
                {event.city
                  ? escapeHtml(event.city)
                  : `${(event.latitude as number).toFixed(2)}°, ${(event.longitude as number).toFixed(2)}°`}
              </strong>
              {event.country ? `, ${escapeHtml(event.country)}` : ""}
              <br />
              <span style={{ color: severityColor[event.severity], fontWeight: 600 }}>
                {event.severity}
              </span>
              {" · "}
              <a href={`/events/${event.id}`}>{escapeHtml(event.title)}</a>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md border border-border bg-background/90 p-3 text-xs shadow-lg backdrop-blur">
        <div className="mb-2 font-medium text-foreground">Country risk</div>
        <div className="grid gap-1">
          {riskLegend.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-3 w-7 rounded-sm border border-white/40"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function featureKey(country: CountryFeature) {
  return normalizeCountryName(country.properties?.name ?? "");
}

function bindCountryPopup(
  country: CountryFeature,
  layer: Layer,
  countries: ReturnType<typeof riskLookup>
) {
  const name = country.properties?.name ?? "Unknown";
  const point = countries.get(featureKey(country));

  if (!point) {
    layer.bindPopup(`<strong>${escapeHtml(name)}</strong><br/><span>No published risk events.</span>`);
    return;
  }

  const links = point.events
    .slice(0, 5)
    .map(
      (event) =>
        `<li><a href="/events/${escapeHtml(event.id)}">${escapeHtml(event.title)}</a></li>`
    )
    .join("");

  layer.bindPopup(`
    <strong>${escapeHtml(point.country)}</strong>
    <div>${escapeHtml(point.label)} risk · ${Math.round(point.riskScore * 100)} score · ${point.eventCount} event${point.eventCount === 1 ? "" : "s"}</div>
    <ul style="margin: 8px 0 0 16px; padding: 0;">${links}</ul>
  `);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
