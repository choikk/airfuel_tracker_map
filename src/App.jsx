import React, { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Search, RefreshCw, Fuel, TrendingUp } from "lucide-react";

const FUEL_OPTIONS = [
  { value: "100LL", label: "100LL" },
  { value: "JET_A", label: "Jet-A" },
  { value: "SAF", label: "SAF" },
  { value: "MOGAS", label: "MOGAS" },
  { value: "UL94", label: "UL94" },
  { value: "UL91", label: "UL91" },
];

const topStarIcon = L.divIcon({
  className: "top-star-marker",
  html: `
    <div style="
      color:#000;
      font-size:28px;
      line-height:28px;
      font-weight:700;
      text-shadow:
        0 0 2px #fff,
        0 0 4px #fff,
        0 0 6px #fff;
      pointer-events:none;
    ">★</div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
});

function FitBounds({ airports }) {
  const map = useMap();

  useEffect(() => {
    if (!airports.length) return;

    const bounds = airports
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
      .map((a) => [a.lat, a.lon]);

    if (!bounds.length) return;

    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
      return;
    }

    map.fitBounds(bounds, { padding: [24, 24] });
  }, [airports, map]);

  return null;
}

function MapBoundsWatcher({ onBoundsChange }) {
  const map = useMapEvents({
    moveend() {
      onBoundsChange(map.getBounds());
    },
    zoomend() {
      onBoundsChange(map.getBounds());
    },
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
}

function MapInstanceCapture({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function priceToColor(price, min, max) {
  if (price == null) return "#94a3b8";
  if (min == null || max == null || min === max) return "#eab308";

  const ratio = Math.max(0, Math.min(1, (price - min) / (max - min)));

  if (ratio <= 0.15) return "#166534";
  if (ratio <= 0.3) return "#16a34a";
  if (ratio <= 0.45) return "#65a30d";
  if (ratio <= 0.6) return "#eab308";
  if (ratio <= 0.75) return "#f59e0b";
  if (ratio <= 0.9) return "#ef4444";
  return "#b91c1c";
}

function toDisplayPrice(value) {
  if (value == null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `$${n.toFixed(2)}`;
}

function isCanadaAirport(airport) {
  return String(airport?.state || "").toUpperCase().includes("CANADA");
}

function formatMiniTrendDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());

  return `${mm}-${dd}-${yyyy}`;
}

function MiniTrend({ points, width = 260, height = 110, showPointLabels = false }) {
  if (!points || points.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const cleanPoints = points
    .map((p) => {
      const value = Number(p.avg_price ?? p.price);
      if (!Number.isFinite(value)) return null;

      const rawDate = p.reported_date || p.date || p.valid_from || "";
      const parsedTime = Date.parse(rawDate);

      return {
        raw: p,
        value,
        date: rawDate,
        sortTime: Number.isNaN(parsedTime) ? null : parsedTime,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.sortTime != null && b.sortTime != null) return a.sortTime - b.sortTime;
      if (a.sortTime != null) return -1;
      if (b.sortTime != null) return 1;
      return String(a.date).localeCompare(String(b.date));
    });

  if (cleanPoints.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const values = cleanPoints.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const paddingLeft = 10;
  const paddingRight = showPointLabels ? 44 : 10;
  const paddingTop = showPointLabels ? 20 : 8;
  const paddingBottom = showPointLabels ? 18 : 8;

  const usableW = width - paddingLeft - paddingRight;
  const usableH = height - paddingTop - paddingBottom;

  const coords = cleanPoints.map((p, i) => {
    const x = paddingLeft + (i / Math.max(1, cleanPoints.length - 1)) * usableW;
    const y =
      paddingTop +
      (max === min ? usableH / 2 : (1 - (p.value - min) / (max - min)) * usableH);

    return {
      ...p,
      x,
      y,
      labelDate: formatMiniTrendDate(p.date),
      labelPrice: `$${p.value.toFixed(2)}`,
    };
  });

  const polylinePoints = coords.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div style={{ width, maxWidth: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", maxWidth: "100%", overflow: "visible" }}
      >
        <polyline fill="none" stroke="#0284c7" strokeWidth="2" points={polylinePoints} />

        {coords.map((p, idx) => {
          const isNearRight = p.x > width - 70;
          const labelX = isNearRight ? p.x - 4 : p.x + 4;
          const anchor = isNearRight ? "end" : "start";
          const dateY = p.y - 8 < 10 ? p.y + 12 : p.y - 8;
          const priceY = dateY + 11;

          return (
            <g key={`${p.labelDate}-${p.labelPrice}-${idx}`}>
              <circle cx={p.x} cy={p.y} r="3" fill="#0284c7" />
              {showPointLabels && (
                <>
                  <text
                    x={labelX}
                    y={dateY}
                    fontSize="8"
                    textAnchor={anchor}
                    fill="#475569"
                  >
                    {p.labelDate}
                  </text>
                  <text
                    x={labelX}
                    y={priceY}
                    fontSize="8"
                    textAnchor={anchor}
                    fill="#0f172a"
                  >
                    {p.labelPrice}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DualTrend({ nationalPoints, regionalPoints, width = 260, height = 150 }) {
  const normalize = (points) =>
    (points || [])
      .map((p) => {
        const value = Number(p.avg_price ?? p.price);
        const rawDate = p.date || p.reported_date || p.valid_from || "";
        const t = Date.parse(rawDate);
        if (!Number.isFinite(value) || Number.isNaN(t)) return null;
        return {
          value,
          date: rawDate,
          time: t,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

  const national = normalize(nationalPoints);
  const regional = normalize(regionalPoints);

  if (national.length < 2 && regional.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const all = [...national, ...regional];
  const minTime = Math.min(...all.map((p) => p.time));
  const maxTime = Math.max(...all.map((p) => p.time));
  const minValue = Math.min(...all.map((p) => p.value));
  const maxValue = Math.max(...all.map((p) => p.value));

  const paddingLeft = 10;
  const paddingRight = 10;
  const paddingTop = 10;
  const paddingBottom = 20;

  const usableW = width - paddingLeft - paddingRight;
  const usableH = height - paddingTop - paddingBottom;

  const toCoords = (points) =>
    points.map((p) => {
      const x =
        paddingLeft +
        (maxTime === minTime ? usableW / 2 : ((p.time - minTime) / (maxTime - minTime)) * usableW);
      const y =
        paddingTop +
        (maxValue === minValue
          ? usableH / 2
          : (1 - (p.value - minValue) / (maxValue - minValue)) * usableH);
      return { ...p, x, y };
    });

  const nationalCoords = toCoords(national);
  const regionalCoords = toCoords(regional);

  const nationalPolyline = nationalCoords.map((p) => `${p.x},${p.y}`).join(" ");
  const regionalPolyline = regionalCoords.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div style={{ width, maxWidth: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", maxWidth: "100%" }}
      >
        {nationalCoords.length >= 2 && (
          <polyline fill="none" stroke="#0284c7" strokeWidth="2" points={nationalPolyline} />
        )}

        {regionalCoords.length >= 2 && (
          <polyline fill="none" stroke="#dc2626" strokeWidth="2" points={regionalPolyline} />
        )}

        {nationalCoords.map((p, idx) => (
          <circle key={`n-${idx}`} cx={p.x} cy={p.y} r="2.5" fill="#0284c7" />
        ))}

        {regionalCoords.map((p, idx) => (
          <circle key={`r-${idx}`} cx={p.x} cy={p.y} r="2.5" fill="#dc2626" />
        ))}
      </svg>

      <div
        style={{
          marginTop: 8,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          fontSize: 12,
          color: "#475569",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#0284c7",
              display: "inline-block",
            }}
          />
          <span>National average</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#dc2626",
              display: "inline-block",
            }}
          />
          <span>Visible region</span>
        </div>
      </div>
    </div>
  );
}

function PanelSection({ title, icon, children }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        padding: 12,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "#334155",
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [fuelType, setFuelType] = useState("100LL");
  const [serviceType, setServiceType] = useState("FULL");
  const [search, setSearch] = useState("");
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [mapBounds, setMapBounds] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [highlightedAirportCode, setHighlightedAirportCode] = useState(null);
  const [hoveredExtremeAirportCode, setHoveredExtremeAirportCode] = useState(null);
  const [nationalTrend, setNationalTrend] = useState([]);
  const [regionalTrend, setRegionalTrend] = useState([]);
  const [airportTrend, setAirportTrend] = useState([]);
  const [coverageStats, setCoverageStats] = useState({
    totalFuelAirports: 0,
    coveredAirports: 0,
    remainingAirports: 0,
    attemptedLast24h: 0,
    changedLast24h: 0,
  });
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobilePanelOpen(false);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ fuelType, serviceType });
        const res = await fetch(`/.netlify/functions/airports-map?${params.toString()}`);
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        const data = await res.json();

        if (!cancelled) {
          setAirports(Array.isArray(data.airports) ? data.airports : []);
          setLastUpdated(data.generatedAt || "");
          setNationalTrend(Array.isArray(data.nationalTrend) ? data.nationalTrend : []);
          setSelectedAirport(null);
          setAirportTrend([]);
          setHoveredExtremeAirportCode(null);
          setHighlightedAirportCode(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load map data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fuelType, serviceType]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoverageStats() {
      try {
        const res = await fetch("/.netlify/functions/coverage-stats");
        if (!res.ok) throw new Error(`Coverage stats failed: ${res.status}`);

        const data = await res.json();

        if (!cancelled) {
          setCoverageStats({
            totalFuelAirports: Number(data.totalFuelAirports || 0),
            coveredAirports: Number(data.coveredAirports || 0),
            remainingAirports: Number(data.remainingAirports || 0),
            attemptedLast24h: Number(data.attemptedLast24h || 0),
            changedLast24h: Number(data.changedLast24h || 0),
          });
        }
      } catch {
        if (!cancelled) {
          setCoverageStats({
            totalFuelAirports: 0,
            coveredAirports: 0,
            remainingAirports: 0,
            attemptedLast24h: 0,
            changedLast24h: 0,
          });
        }
      }
    }

    loadCoverageStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredAirports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return airports;

    return airports.filter((airport) => {
      const haystack = [
        airport.airport_code,
        airport.airport_name,
        airport.city,
        airport.state,
        airport.fbo_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [airports, search]);

  const visibleAirports = useMemo(() => {
    if (!mapBounds) return filteredAirports;

    return filteredAirports.filter((airport) => {
      if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return false;
      return mapBounds.contains([airport.lat, airport.lon]);
    });
  }, [filteredAirports, mapBounds]);

  const statAirports = useMemo(
    () => filteredAirports.filter((airport) => !isCanadaAirport(airport)),
    [filteredAirports]
  );

  const visibleStatAirports = useMemo(
    () => visibleAirports.filter((airport) => !isCanadaAirport(airport)),
    [visibleAirports]
  );

  const nationalStats = useMemo(() => {
    const values = statAirports
      .map((a) => Number(a.price))
      .filter((v) => Number.isFinite(v));

    if (!values.length) return { min: null, max: null, avg: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    };
  }, [statAirports]);

  const visibleStats = useMemo(() => {
    const values = visibleStatAirports
      .map((a) => Number(a.price))
      .filter((v) => Number.isFinite(v));

    if (!values.length) return { min: null, max: null, avg: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    };
  }, [visibleStatAirports]);

  const visibleExtremes = useMemo(() => {
    if (!visibleStatAirports.length) return { cheapest: null, priciest: null };

    const sorted = [...visibleStatAirports].sort((a, b) => Number(a.price) - Number(b.price));
    return {
      cheapest: sorted[0],
      priciest: sorted[sorted.length - 1],
    };
  }, [visibleStatAirports]);

  const visibleVsNational = useMemo(() => {
    if (visibleStats.avg == null || nationalStats.avg == null) return null;

    const diff = visibleStats.avg - nationalStats.avg;
    return {
      diff,
      direction: diff > 0 ? "above" : diff < 0 ? "below" : "equal to",
    };
  }, [visibleStats, nationalStats]);

  const coveragePercent =
    coverageStats.totalFuelAirports > 0
      ? (coverageStats.coveredAirports / coverageStats.totalFuelAirports) * 100
      : 0;

  useEffect(() => {
    const groups = new Map();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    for (const airport of visibleStatAirports) {
      const key = airport.reported_date;
      const price = Number(airport.price);
      if (!key || !Number.isFinite(price)) continue;

      const d = new Date(key);
      if (Number.isNaN(d.getTime())) continue;
      if (d < cutoff) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(price);
    }

    const points = [...groups.entries()]
      .map(([date, values]) => ({
        date,
        avg_price: values.reduce((sum, v) => sum + v, 0) / values.length,
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    setRegionalTrend(points);
  }, [visibleStatAirports]);

  useEffect(() => {
    let cancelled = false;

    async function loadAirportTrend() {
      if (!selectedAirport?.airport_code) {
        setAirportTrend([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          airportCode: selectedAirport.airport_code,
          fuelType,
          serviceType,
        });

        const res = await fetch(`/.netlify/functions/airport-trend?${params.toString()}`);
        if (!res.ok) throw new Error(`Trend request failed: ${res.status}`);

        const data = await res.json();
        if (!cancelled) {
          setAirportTrend(Array.isArray(data.points) ? data.points : []);
        }
      } catch {
        if (!cancelled) setAirportTrend([]);
      }
    }

    loadAirportTrend();
    return () => {
      cancelled = true;
    };
  }, [selectedAirport, fuelType, serviceType]);

  function focusAirportOnMap(airport) {
    if (!airport || !mapInstance) return;
    if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return;

    setSelectedAirport(airport);
    setHighlightedAirportCode(airport.airport_code);

    const nextZoom = Math.max(mapInstance.getZoom(), 8);
    mapInstance.flyTo([airport.lat, airport.lon], nextZoom, {
      animate: true,
      duration: 0.8,
    });
  }

  const panelContent = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 16 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 16,
            background: "#0f172a",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Fuel size={20} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>AirFuel Tracker</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>
            Live airport fuel map
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Fuel type</label>
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={selectStyle}>
            {FUEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Service type</label>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} style={selectStyle}>
            <option value="FULL">Full service</option>
            <option value="SELF">Self service</option>
            <option value="RA">Restricted</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Search</label>
          <div style={searchBoxStyle}>
            <Search size={16} color="#94a3b8" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Airport, city, FBO"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={cardStyle}>

          <div
            style={{
              marginTop: 2,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Airports shown</div>
              <div style={bigValueStyle}>{visibleStatAirports.length}</div>
              <div style={tinyMutedStyle}>Visible / matched: {statAirports.length}</div>
            </div>

            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Price range</div>
              <div style={{ paddingTop: 8, paddingBottom: 4, fontSize: 20, fontWeight: 600 }}>
                {visibleStats.min == null
                  ? "N/A"
                  : `$${visibleStats.min.toFixed(2)} - $${visibleStats.max.toFixed(2)}`}
              </div>
              <div style={tinyMutedStyle}>
                National:{" "}
                {nationalStats.min == null
                  ? "N/A"
                  : `$${nationalStats.min.toFixed(2)} - $${nationalStats.max.toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>

          <div
            style={{
              marginTop: 2,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Visible area</div>
              <div style={bigValueStyle}>
                {visibleStats.avg == null ? "N/A" : `$${visibleStats.avg.toFixed(2)}`}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>National average</div>
              <div style={bigValueStyle}>
                {nationalStats.avg == null ? "N/A" : `$${nationalStats.avg.toFixed(2)}`}
              </div>
            </div>
          </div>

          <div style={tinyMutedStyle}>
            {visibleVsNational == null
              ? "Comparison unavailable"
              : `Visible area is ${Math.abs(visibleVsNational.diff).toFixed(2)} ${visibleVsNational.direction} national average`}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Lowest in view</div>
          {visibleExtremes.cheapest ? (
            <>
              <div
                style={{ paddingTop: 4, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.cheapest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.cheapest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.cheapest)}
              >
                {visibleExtremes.cheapest.airport_code}
              </div>
              <div
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.cheapest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.cheapest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.cheapest)}
              >
                {visibleExtremes.cheapest.airport_name}
              </div>
              <div
                style={{ color: "#64748b", cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.cheapest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.cheapest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.cheapest)}
              >
                {toDisplayPrice(visibleExtremes.cheapest.price)}
              </div>
            </>
          ) : (
            <div style={{ paddingTop: 4, color: "#64748b" }}>N/A</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Highest in view</div>
          {visibleExtremes.priciest ? (
            <>
              <div
                style={{ paddingTop: 4, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.priciest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.priciest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.priciest)}
              >
                {visibleExtremes.priciest.airport_code}
              </div>
              <div
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.priciest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.priciest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.priciest)}
              >
                {visibleExtremes.priciest.airport_name}
              </div>
              <div
                style={{ color: "#64748b", cursor: "pointer" }}
                onMouseEnter={() => {
                  setHighlightedAirportCode(visibleExtremes.priciest.airport_code);
                  setHoveredExtremeAirportCode(visibleExtremes.priciest.airport_code);
                }}
                onMouseLeave={() => {
                  setHighlightedAirportCode(null);
                  setHoveredExtremeAirportCode(null);
                }}
                onClick={() => focusAirportOnMap(visibleExtremes.priciest)}
              >
                {toDisplayPrice(visibleExtremes.priciest.price)}
              </div>
            </>
          ) : (
            <div style={{ paddingTop: 4, color: "#64748b" }}>N/A</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155", marginBottom: 8 }}>
            Collection coverage
          </div>

          <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
            {coverageStats.coveredAirports.toLocaleString()}
            <span style={{ fontSize: 16, fontWeight: 500, color: "#64748b" }}>
              {" "}
              / {coverageStats.totalFuelAirports.toLocaleString()}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Remaining: {coverageStats.remainingAirports.toLocaleString()}
          </div>

          <div
            style={{
              marginTop: 10,
              height: 10,
              width: "100%",
              borderRadius: 999,
              background: "#e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${coveragePercent.toFixed(1)}%`,
                background: "#2563eb",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
            {coveragePercent.toFixed(1)}% collected
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <div
              style={{
                borderRadius: 12,
                background: "#f8fafc",
                padding: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b" }}>Last 24h attempted</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                {coverageStats.attemptedLast24h.toLocaleString()}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                background: "#f8fafc",
                padding: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: 12, color: "#64748b" }}>Last 24h changed</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                {coverageStats.changedLast24h.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 16,
            background: "#f8fafc",
            padding: 12,
            fontSize: 14,
            color: "#475569",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#1e293b" }}>
            <RefreshCw size={14} />
            Data status
          </div>
          <div style={{ paddingTop: 8 }}>{loading ? "Loading…" : error ? error : "Loaded"}</div>
          <div style={{ paddingTop: 4, fontSize: 12, color: "#64748b", wordBreak: "break-all" }}>
            {lastUpdated ? `Generated: ${lastUpdated}` : "No timestamp yet"}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#334155" }}>
            Visible-region palette
          </div>
          <div
            style={{
              height: 12,
              width: "100%",
              overflow: "hidden",
              borderRadius: 999,
              border: "1px solid #e2e8f0",
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
            }}
          >
            <div style={{ background: "#166534" }} />
            <div style={{ background: "#16a34a" }} />
            <div style={{ background: "#65a30d" }} />
            <div style={{ background: "#eab308" }} />
            <div style={{ background: "#f59e0b" }} />
            <div style={{ background: "#ef4444" }} />
            <div style={{ background: "#b91c1c" }} />
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>

        <PanelSection title="National vs visible region trend" icon={<TrendingUp size={14} />}>
          <DualTrend
            nationalPoints={nationalTrend}
            regionalPoints={regionalTrend}
            width={260}
            height={150}
          />
        </PanelSection>
      </div>
    </>
  );

  const renderMarkers = () => (
    <>
      {filteredAirports.map((airport) => {
        const price = Number(airport.price);
        const validPrice = Number.isFinite(price) ? price : null;
        const isCanada = isCanadaAirport(airport);
        const color = isCanada ? "#000000" : priceToColor(validPrice, visibleStats.min, visibleStats.max);

        return (
          <CircleMarker
            key={`${airport.airport_code}-${airport.fbo_name}-${airport.fuel_type}-${airport.service_type}`}
            center={[airport.lat, airport.lon]}
            radius={8}
            pathOptions={{
              color: highlightedAirportCode === airport.airport_code ? "#111827" : color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: highlightedAirportCode === airport.airport_code ? 3 : 1,
            }}
            eventHandlers={{ click: () => setSelectedAirport(airport) }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {airport.airport_code} · {toDisplayPrice(airport.price)}
              </div>
            </Tooltip>

            <Popup>
              <div style={{ minWidth: 220, display: "grid", gap: 4, fontSize: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{airport.airport_code}</div>
                <div>{airport.airport_name || "Unknown airport"}</div>
                <div style={{ color: "#475569" }}>
                  {airport.city}, {airport.state}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <span style={{ fontWeight: 600 }}>FBO:</span> {airport.fbo_name}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Fuel:</span> {airport.fuel_type}_{airport.service_type}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Price:</span> {toDisplayPrice(airport.price)}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Reported:</span> {airport.reported_date || "N/A"}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Guaranteed:</span> {airport.guaranteed ? "Yes" : "No"}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#475569" }}>
                    Recent airport trend
                  </div>
                  {selectedAirport?.airport_code === airport.airport_code ? (
                    <MiniTrend points={airportTrend} width={260} height={110} showPointLabels />
                  ) : (
                    <div style={{ fontSize: 12, color: "#64748b" }}>Tap marker to load trend</div>
                  )}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {hoveredExtremeAirportCode &&
        filteredAirports
          .filter((airport) => airport.airport_code === hoveredExtremeAirportCode)
          .map((airport) => (
            <Marker
              key={`top-star-${airport.airport_code}-${airport.fbo_name}`}
              position={[airport.lat, airport.lon]}
              icon={topStarIcon}
              zIndexOffset={100000}
              interactive={false}
            />
          ))}
    </>
  );

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#f1f5f9",
        color: "#0f172a",
        overflow: "hidden",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {isMobile ? (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <main style={{ width: "100%", height: "100%" }}>
            <MapContainer center={[39.5, -98.35]} zoom={4} style={{ width: "100%", height: "100%" }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapInstanceCapture onReady={setMapInstance} />
              <FitBounds airports={filteredAirports} />
              <MapBoundsWatcher onBoundsChange={setMapBounds} />
              {renderMarkers()}
            </MapContainer>
          </main>

          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderRadius: 18,
              background: "rgba(255,255,255,0.95)",
              padding: "10px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>AirFuel Tracker</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {fuelType} · {serviceType}
              </div>
            </div>
            <button
              onClick={() => setMobilePanelOpen((v) => !v)}
              style={{
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "#fff",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {mobilePanelOpen ? "Hide panel" : "Show panel"}
            </button>
          </div>

          {mobilePanelOpen && (
            <div
              onClick={() => setMobilePanelOpen(false)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.25)",
                zIndex: 1001,
              }}
            />
          )}

          <aside
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1002,
              maxHeight: "50vh",
              overflowY: "auto",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTop: "1px solid #e2e8f0",
              background: "#fff",
              padding: 16,
              boxShadow: "0 -12px 32px rgba(0,0,0,0.18)",
              transform: mobilePanelOpen ? "translateY(0)" : "translateY(calc(100% - 64px))",
              transition: "transform 0.28s ease",
            }}
          >
            <div
              style={{
                width: 48,
                height: 6,
                borderRadius: 999,
                background: "#cbd5e1",
                margin: "0 auto 12px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>Filters & stats</div>
              <button
                onClick={() => setMobilePanelOpen((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#64748b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {mobilePanelOpen ? "Collapse" : "Expand"}
              </button>
            </div>
            {panelContent}
          </aside>
        </div>
      ) : (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          <aside
            style={{
              width: 340,
              minWidth: 340,
              maxWidth: 340,
              height: "100%",
              overflowY: "auto",
              background: "#fff",
              borderRight: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              padding: 16,
            }}
          >
            {panelContent}
          </aside>

          <main style={{ flex: 1, minWidth: 0, height: "100%" }}>
            <MapContainer center={[39.5, -98.35]} zoom={4} style={{ width: "100%", height: "100%" }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapInstanceCapture onReady={setMapInstance} />
              <FitBounds airports={filteredAirports} />
              <MapBoundsWatcher onBoundsChange={setMapBounds} />
              {renderMarkers()}
            </MapContainer>
          </main>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 12,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 600,
  color: "#334155",
};

const selectStyle = {
  width: "100%",
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  background: "#fff",
  padding: "10px 12px",
  fontSize: 14,
};

const searchBoxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const inputStyle = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: 14,
};

const bigValueStyle = {
  paddingTop: 4,
  fontSize: 28,
  fontWeight: 600,
};

const tinyMutedStyle = {
  paddingTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const smallTitleStyle = {
  fontSize: 14,
  color: "#64748b",
};
