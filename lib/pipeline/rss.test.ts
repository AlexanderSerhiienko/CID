import { describe, expect, it } from "vitest";
import { parseGeoRssCoords } from "./rss";

describe("parseGeoRssCoords", () => {
  it("parses georss:point with lat and lon separated by space", () => {
    const result = parseGeoRssCoords({ "georss:point": "35.1234 -117.4567" });
    expect(result).toEqual({ lat: 35.1234, lon: -117.4567 });
  });

  it("parses georss:point with extra whitespace", () => {
    const result = parseGeoRssCoords({ "georss:point": "  -4.0383   21.7587  " });
    expect(result).toEqual({ lat: -4.0383, lon: 21.7587 });
  });

  it("parses geo:lat / geo:long pair", () => {
    const result = parseGeoRssCoords({ "geo:lat": "51.5074", "geo:long": "-0.1278" });
    expect(result).toEqual({ lat: 51.5074, lon: -0.1278 });
  });

  it("returns null when no GeoRSS fields are present", () => {
    const result = parseGeoRssCoords({});
    expect(result).toBeNull();
  });

  it("returns null when georss:point has invalid format", () => {
    const result = parseGeoRssCoords({ "georss:point": "not-a-number" });
    expect(result).toBeNull();
  });

  it("returns null when georss:point has only one coordinate", () => {
    const result = parseGeoRssCoords({ "georss:point": "35.1234" });
    expect(result).toBeNull();
  });

  it("prefers georss:point over geo:lat/geo:long when both are present", () => {
    const result = parseGeoRssCoords({
      "georss:point": "10.0 20.0",
      "geo:lat": "99.0",
      "geo:long": "99.0"
    });
    expect(result).toEqual({ lat: 10.0, lon: 20.0 });
  });
});
