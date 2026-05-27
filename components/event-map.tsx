"use client";

import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Layer } from "leaflet";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import { feature } from "topojson-client";
import countriesTopology from "world-atlas/countries-50m.json";
import {
  MapRiskEvent,
  normalizeCountryName,
  riskLookup,
  riskLegend,
} from "@/lib/map/risk-scale";

type CountryFeature = Feature<Geometry, { name?: string }>;

const countryFeatures = feature(
  countriesTopology as never,
  (countriesTopology as { objects: { countries: unknown } }).objects.countries as never
) as unknown as FeatureCollection<Geometry, { name?: string }>;

export function EventMap({ events }: { events: MapRiskEvent[] }) {
  const countries = riskLookup(events);

  return (
    <div className="relative h-[460px] overflow-hidden rounded-md border border-border bg-card">
      <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom className="h-full bg-slate-950">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
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
