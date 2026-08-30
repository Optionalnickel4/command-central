import { afterEach, describe, expect, it } from "vitest";
import {
  WMO_CONDITIONS, conditionFor, normalizeCurrent, weatherCoords, weatherLabel
} from "@/lib/weather";
import { NOT_PRESENT, OK, configStatus } from "@/lib/response-status";

/**
 * The pure half of the weather source: the WMO code table and the shaping of
 * Open-Meteo's `current` block. The fetch itself is deliberately not exercised
 * — it is transport, and testing it would mean reaching api.open-meteo.com.
 *
 * Fixtures are the shape Open-Meteo actually returned when probed from 220,
 * trimmed to the fields the transform reads.
 */

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("conditionFor — WMO 4677 codes", () => {
  it("maps the codes Philadelphia actually produces", () => {
    expect(conditionFor(0)).toBe("Clear sky");
    expect(conditionFor(1)).toBe("Mainly clear");
    expect(conditionFor(2)).toBe("Partly cloudy");
    expect(conditionFor(3)).toBe("Overcast");
    expect(conditionFor(61)).toBe("Light rain");
    expect(conditionFor(95)).toBe("Thunderstorm");
  });

  it("keeps intensity distinct — the part a glance at the panel uses", () => {
    expect(conditionFor(61)).not.toBe(conditionFor(65));
    expect(conditionFor(71)).not.toBe(conditionFor(75));
    expect(conditionFor(51)).not.toBe(conditionFor(55));
  });

  it("falls back to Unknown rather than inventing a condition", () => {
    // An unlisted code, a non-number, and nothing at all.
    expect(conditionFor(7)).toBe("Unknown");
    expect(conditionFor("2")).toBe("Unknown");
    expect(conditionFor(undefined)).toBe("Unknown");
    expect(conditionFor(null)).toBe("Unknown");
  });

  it("gives every documented code a non-empty distinct-ish string", () => {
    for (const [code, label] of Object.entries(WMO_CONDITIONS)) {
      expect(label, `code ${code}`).toBeTruthy();
      expect(conditionFor(Number(code))).toBe(label);
    }
  });
});

describe("normalizeCurrent", () => {
  // Verbatim shape from api.open-meteo.com for 39.9526/-75.1652.
  const payload = {
    current_units: { temperature_2m: "°F", weather_code: "wmo code" },
    current: { time: "2026-08-30T23:00", temperature_2m: 79.5, weather_code: 1, apparent_temperature: 85.5 }
  };

  it("rounds the temperatures — the panel has no room for decimals", () => {
    expect(normalizeCurrent(payload)).toEqual({
      tempF: 80,
      feelsLikeF: 86,
      condition: "Mainly clear"
    });
  });

  it("reports a null temperature rather than a zero when the field is missing", () => {
    // 0°F is a real reading; a missing field must not become one.
    const shaped = normalizeCurrent({ current: { weather_code: 3 } });
    expect(shaped.tempF).toBeNull();
    expect(shaped.feelsLikeF).toBeNull();
    expect(shaped.condition).toBe("Overcast");
  });

  it("keeps a genuine zero reading", () => {
    expect(normalizeCurrent({ current: { temperature_2m: 0, weather_code: 71 } }).tempF).toBe(0);
  });

  it("survives a payload with no current block at all", () => {
    for (const junk of [null, undefined, {}, { current: null }, "nope", []]) {
      expect(() => normalizeCurrent(junk)).not.toThrow();
      expect(normalizeCurrent(junk).tempF).toBeNull();
    }
  });

  it("does not treat NaN or Infinity as a reading", () => {
    expect(normalizeCurrent({ current: { temperature_2m: NaN } }).tempF).toBeNull();
    expect(normalizeCurrent({ current: { temperature_2m: Infinity } }).tempF).toBeNull();
  });
});

describe("weatherCoords — config detection", () => {
  it("reads a configured pair", () => {
    process.env.WEATHER_LAT = "39.9526";
    process.env.WEATHER_LON = "-75.1652";
    expect(weatherCoords()).toEqual({ lat: 39.9526, lon: -75.1652 });
  });

  it("is null when either half is unset or blank — a lone coordinate is useless", () => {
    process.env.WEATHER_LAT = "39.9526";
    delete process.env.WEATHER_LON;
    expect(weatherCoords()).toBeNull();

    process.env.WEATHER_LON = "   ";
    expect(weatherCoords()).toBeNull();
  });

  it("rejects unparseable or out-of-range coordinates instead of sending them", () => {
    for (const [lat, lon] of [["abc", "-75.1652"], ["91", "-75.1652"], ["39.95", "181"]]) {
      process.env.WEATHER_LAT = lat;
      process.env.WEATHER_LON = lon;
      expect(weatherCoords(), `${lat}/${lon}`).toBeNull();
    }
  });
});

describe("weatherLabel", () => {
  const coords = { lat: 39.9526, lon: -75.1652 };

  it("uses an explicit label when one is set", () => {
    process.env.WEATHER_LOCATION = "Philadelphia";
    expect(weatherLabel(coords)).toBe("Philadelphia");
  });

  it("falls back to the coordinates rather than claiming a city it wasn't told", () => {
    delete process.env.WEATHER_LOCATION;
    expect(weatherLabel(coords)).toBe("39.95, -75.17");
  });
});

describe("configStatus — the pre-setup state is not a failure", () => {
  it("is 404 when unconfigured and 200 once configured", () => {
    expect(configStatus(false)).toBe(NOT_PRESENT);
    expect(configStatus(true)).toBe(OK);
  });

  it("is never a 5xx — nothing is broken before setup", () => {
    expect(configStatus(false)).toBeLessThan(500);
  });
});
