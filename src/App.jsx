import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { Search, RefreshCw, Fuel } from "lucide-react";
import { trackEvent } from "./lib/analytics.js";

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

function toDateOnly(value) {
  if (!value) return "Unknown";

  const parsedTime = Date.parse(value);
  if (Number.isNaN(parsedTime)) {
    const fallback = String(value).slice(0, 10);
    return fallback || "Unknown";
  }

  return new Date(parsedTime).toISOString().slice(0, 10);
}

function FitBounds({ airports }) {
  const map = useMap();
  const [hasFit, setHasFit] = React.useState(false);

  useEffect(() => {
    if (hasFit || !airports.length) return;

    const bounds = airports
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
      .map((a) => [a.lat, a.lon]);

    if (!bounds.length) return;

    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
    setHasFit(true);
  }, [airports, map, hasFit]);

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
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

function MapResizeFix({ deps = [] }) {
  const map = useMap();

  useEffect(() => {
    const run = () => {
      requestAnimationFrame(() => {
        map.invalidateSize(false);
      });
    };

    const timeoutId = setTimeout(run, 50);

    window.addEventListener("resize", run);
    window.addEventListener("orientationchange", run);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", run);
    vv?.addEventListener("scroll", run);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", run);
      window.removeEventListener("orientationchange", run);
      vv?.removeEventListener("resize", run);
      vv?.removeEventListener("scroll", run);
    };
  }, [map, ...deps]);

  return null;
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
    .sort((a, b) => (a.sortTime ?? 0) - (b.sortTime ?? 0));

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
    const x = paddingLeft + (i / (cleanPoints.length - 1)) * usableW;
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
            <g key={idx}>
              <circle cx={p.x} cy={p.y} r="3" fill="#0284c7" />
              {showPointLabels && (
                <>
                  <text x={labelX} y={dateY} fontSize="8" textAnchor={anchor} fill="#475569">
                    {p.labelDate}
                  </text>
                  <text x={labelX} y={priceY} fontSize="8" textAnchor={anchor} fill="#0f172a">
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
        return { value, date: rawDate, time: t };
      })
      .filter(Boolean)
      .sort((a, b) => a.time - b.time);

  const national = normalize(nationalPoints);
  const regional = normalize(regionalPoints);

  if (national.length < 2 && regional.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const all = [...national, ...regional];
  if (all.length === 0) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

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
    points.map((p) => ({
      ...p,
      x:
        paddingLeft +
        (maxTime === minTime ? usableW / 2 : ((p.time - minTime) / (maxTime - minTime)) * usableW),
      y:
        paddingTop +
        (maxValue === minValue
          ? usableH / 2
          : (1 - (p.value - minValue) / (maxValue - minValue)) * usableH),
    }));

  const nationalCoords = toCoords(national);
  const regionalCoords = toCoords(regional);

  return (
    <div style={{ width, maxWidth: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", maxWidth: "100%" }}
      >
        {nationalCoords.length >= 2 && (
          <polyline
            fill="none"
            stroke="#0284c7"
            strokeWidth="2"
            points={nationalCoords.map((p) => `${p.x},${p.y}`).join(" ")}
          />
        )}
        {regionalCoords.length >= 2 && (
          <polyline
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            points={regionalCoords.map((p) => `${p.x},${p.y}`).join(" ")}
          />
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
          National average
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
          Visible region
        </div>
      </div>
    </div>
  );
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

export default function App() {
  const [fuelType, setFuelType] = useState("100LL");
  const [serviceType, setServiceType] = useState("FULL");
  const [search, setSearch] = useState("");
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [databaseUpdatedAt, setDatabaseUpdatedAt] = useState("");
  const [mapBounds, setMapBounds] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [highlightedAirportCode, setHighlightedAirportCode] = useState(null);
  const [hoveredExtremeAirportCode, setHoveredExtremeAirportCode] = useState(null);
  const [nationalTrend, setNationalTrend] = useState([]);
  const [regionalTrend, setRegionalTrend] = useState([]);
  const [airportTrend, setAirportTrend] = useState([]);
  const [isLoadingTrend, setIsLoadingTrend] = useState(false);

  const [coverageStats, setCoverageStats] = useState({
    totalFuelAirports: 0,
    coveredAirports: 0,
    remainingAirports: 0,
    attemptedLast24h: 0,
    changedLast24h: 0,
    recentPriceChanges: [],
  });
  const [appMeta, setAppMeta] = useState({
    softwareVersion: "Unknown",
    lastModified: "",
    branch: "Unknown",
  });

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const databaseVersion = toDateOnly(databaseUpdatedAt);
  const appVersion =
    appMeta.softwareVersion && appMeta.softwareVersion !== "Unknown"
      ? appMeta.softwareVersion
      : __APP_VERSION__;

  function showCredits() {
    trackEvent("view_credits", {
      surface: isMobile ? "mobile" : "desktop",
    });

    window.alert(
      `Credits\nCross Country Flight Planner\nApp version: ${appVersion}\nDatabase update: ${databaseVersion}\nMap data © OpenStreetMap contributors\nBuilt with React, Vite, Leaflet, and a lot of care.\n© 2026 pilot.drchoi@gmail.com. All rights reserved.`
    );
  }

  const SWIPE_THRESHOLD = 40;
  const MOBILE_PANEL_HANDLE_HEIGHT = 88;

  const gestureRef = useRef({
    startY: null,
    currentY: null,
    active: false,
  });
  const activePopupMarkerRef = useRef(null);

  function handlePanelTouchStart(e) {
    const y = e.touches?.[0]?.clientY;
    if (typeof y !== "number") return;
    const panelTop = e.currentTarget?.getBoundingClientRect?.().top;
    const offsetY = typeof panelTop === "number" ? y - panelTop : Number.POSITIVE_INFINITY;
    if (offsetY > MOBILE_PANEL_HANDLE_HEIGHT) return;

    gestureRef.current.startY = y;
    gestureRef.current.currentY = y;
    gestureRef.current.active = true;
  }

  function handlePanelTouchMove(e) {
    if (!gestureRef.current.active) return;

    const y = e.touches?.[0]?.clientY;
    if (typeof y !== "number") return;

    gestureRef.current.currentY = y;

    if (e.cancelable) e.preventDefault();
  }

  function finishPanelGesture() {
    if (!gestureRef.current.active) return;

    const { startY, currentY } = gestureRef.current;
    const deltaY =
      typeof startY === "number" && typeof currentY === "number"
        ? currentY - startY
        : 0;

    if (Math.abs(deltaY) >= SWIPE_THRESHOLD) {
      if (deltaY < 0) {
        setMobilePanelOpen(true);
      } else {
        setMobilePanelOpen(false);
      }
    }

    gestureRef.current.startY = null;
    gestureRef.current.currentY = null;
    gestureRef.current.active = false;
  }

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

    async function loadAppMeta() {
      try {
        const res = await fetch("/.netlify/functions/app-meta");
        if (!res.ok) throw new Error("Failed to load app metadata");

        const data = await res.json();
        if (!cancelled) {
          setAppMeta({
            softwareVersion:
              typeof data?.softwareVersion === "string" && data.softwareVersion.trim()
                ? data.softwareVersion
                : "Unknown",
            lastModified: typeof data?.lastModified === "string" ? data.lastModified : "",
            branch:
              typeof data?.branch === "string" && data.branch.trim() ? data.branch : "Unknown",
          });
        }
      } catch {
        if (!cancelled) {
          setAppMeta({
            softwareVersion: "Unknown",
            lastModified: "",
            branch: "Unknown",
          });
        }
      }
    }

    loadAppMeta();
    return () => {
      cancelled = true;
    };
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
          setDatabaseUpdatedAt(data.databaseUpdatedAt || "");
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
        const params = new URLSearchParams({ fuelType, serviceType });
        const res = await fetch(`/.netlify/functions/coverage-stats?${params.toString()}`);
        if (!res.ok) throw new Error(`Coverage stats failed: ${res.status}`);

        const data = await res.json();
        if (!cancelled) {
          setCoverageStats({
            totalFuelAirports: Number(data.totalFuelAirports || 0),
            coveredAirports: Number(data.coveredAirports || 0),
            remainingAirports: Number(data.remainingAirports || 0),
            attemptedLast24h: Number(data.attemptedLast24h || 0),
            changedLast24h: Number(data.changedLast24h || 0),
            recentPriceChanges: Array.isArray(data.recentPriceChanges)
              ? data.recentPriceChanges
              : [],
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
            recentPriceChanges: [],
          });
        }
      }
    }

    loadCoverageStats();
    return () => {
      cancelled = true;
    };
  }, [fuelType, serviceType]);

  useEffect(() => {
    let cancelled = false;

    async function loadAirportTrend() {
      if (!selectedAirport?.airport_code) {
        setAirportTrend([]);
        setIsLoadingTrend(false);
        return;
      }

      setIsLoadingTrend(true);
      try {
        const params = new URLSearchParams({
          airportCode: selectedAirport.airport_code,
          fuelType,
          serviceType,
        });

        const res = await fetch(`/.netlify/functions/airport-trend?${params.toString()}`);
        if (!res.ok) throw new Error("Trend request failed");

        const data = await res.json();
        if (!cancelled) {
          setAirportTrend(Array.isArray(data.points) ? data.points : []);
        }
      } catch {
        if (!cancelled) setAirportTrend([]);
      } finally {
        if (!cancelled) setIsLoadingTrend(false);
      }
    }

    loadAirportTrend();
    return () => {
      cancelled = true;
    };
  }, [selectedAirport?.airport_code, fuelType, serviceType]);

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
    const values = statAirports.map((a) => Number(a.price)).filter((v) => Number.isFinite(v));
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
      if (Number.isNaN(d.getTime()) || d < cutoff) continue;

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

  function focusAirportOnMap(airport) {
    if (!airport || !mapInstance) return;
    if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return;

    if (activePopupMarkerRef.current) {
      activePopupMarkerRef.current.closePopup();
      activePopupMarkerRef.current = null;
    }

    setSelectedAirport(airport);
    setHighlightedAirportCode(airport.airport_code);
    trackEvent("select_airport", {
      airport_code: airport.airport_code || "unknown",
      fuel_type: fuelType,
      service_type: serviceType,
    });

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
        <div style={{ minWidth: 0 }}>
          <h1
            onClick={showCredits}
            style={{ margin: 0, fontSize: 28, fontWeight: 700, cursor: "pointer" }}
            title="Show credits"
          >
            AirFuel Tracker
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>
            Live airport fuel price and trend.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Fuel type</label>
          <select
            value={fuelType}
            onChange={(e) => {
              const nextFuelType = e.target.value;
              setFuelType(nextFuelType);
              trackEvent("select_fuel_type", {
                fuel_type: nextFuelType,
              });
            }}
            style={selectStyle}
          >
            {FUEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Service type</label>
          <select
            value={serviceType}
            onChange={(e) => {
              const nextServiceType = e.target.value;
              setServiceType(nextServiceType);
              trackEvent("select_service_type", {
                service_type: nextServiceType,
              });
            }}
            style={selectStyle}
          >
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Airports shown</div>
              <div style={bigValueStyle}>{visibleStatAirports.length}</div>
              <div style={tinyMutedStyle}>Visible / matched: {statAirports.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Price range</div>
              <div style={{ paddingTop: 8, fontSize: 20, fontWeight: 600 }}>
                {visibleStats.min == null
                  ? "N/A"
                  : `$${visibleStats.min.toFixed(2)} - $${visibleStats.max.toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>Visible area</div>
              <div style={bigValueStyle}>
                {visibleStats.avg == null ? "N/A" : `$${visibleStats.avg.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>
                National average
              </div>
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
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {visibleExtremes.cheapest.airport_code}
              </div>
              <div>{visibleExtremes.cheapest.airport_name}</div>
              <div style={{ color: "#64748b" }}>{toDisplayPrice(visibleExtremes.cheapest.price)}</div>
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>N/A</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Highest in view</div>
          {visibleExtremes.priciest ? (
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
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {visibleExtremes.priciest.airport_code}
              </div>
              <div>{visibleExtremes.priciest.airport_name}</div>
              <div style={{ color: "#64748b" }}>{toDisplayPrice(visibleExtremes.priciest.price)}</div>
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>N/A</div>
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
              background: "#e2e8f0",
              borderRadius: 999,
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
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155", marginBottom: 8 }}>
            Most recent price changes
          </div>
          {coverageStats.recentPriceChanges.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {coverageStats.recentPriceChanges.map((item) => {
                const matchingAirport = airports.find(
                  (airport) => airport.airport_code === item.airportCode
                );

                return (
                  <div
                    key={`${item.airportCode}-${item.changedAt}`}
                    onClick={() => matchingAirport && focusAirportOnMap(matchingAirport)}
                    style={{
                      cursor: matchingAirport ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                      {item.airportCode || "Unknown"}
                    </div>
                    <div style={{ fontSize: 13, color: "#475569" }}>
                      {item.airportName || "Unnamed airport"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {toDateOnly(item.changedAt)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b" }}>No recent price changes found.</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: "#334155" }}>
            National vs visible region trend
          </div>
          <DualTrend nationalPoints={nationalTrend} regionalPoints={regionalTrend} />
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
          <div
            style={{
              paddingTop: 4,
              fontSize: 12,
              color: "#64748b",
              wordBreak: "break-all",
            }}
          >
            {lastUpdated ? `Generated: ${lastUpdated}` : "No timestamp yet"}
          </div>
        </div>
      </div>
    </>
  );

  const renderMarkers = () => (
    <>
      {filteredAirports.map((airport) => {
        if (!Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return null;

        const price = Number(airport.price);
        const validPrice = Number.isFinite(price) ? price : null;
        const isCanada = isCanadaAirport(airport);
        const color = isCanada ? "#000000" : priceToColor(validPrice, visibleStats.min, visibleStats.max);
        const isHighlighted = highlightedAirportCode === airport.airport_code;
        const isSelectedAirport = selectedAirport?.airport_code === airport.airport_code;

        const latestTrendPoint =
          isSelectedAirport && airportTrend.length
            ? [...airportTrend]
                .map((p) => {
                  const rawDate = p.reported_date || p.date || p.valid_from || "";
                  const parsedTime = Date.parse(rawDate);
                  return {
                    ...p,
                    rawDate,
                    parsedTime: Number.isNaN(parsedTime) ? -1 : parsedTime,
                  };
                })
                .sort((a, b) => b.parsedTime - a.parsedTime)[0]
            : null;

        const popupPrice = latestTrendPoint
          ? Number(latestTrendPoint.avg_price ?? latestTrendPoint.price)
          : airport.price;

        const popupReported = latestTrendPoint ? latestTrendPoint.rawDate : airport.reported_date;
        const popupGuaranteed = latestTrendPoint?.guaranteed ?? airport.guaranteed;

        return (
          <CircleMarker
            key={`${airport.airport_code}-${airport.fbo_name}`}
            center={[airport.lat, airport.lon]}
            radius={8}
            pathOptions={{
              color: isHighlighted ? "#111827" : color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isHighlighted ? 3 : 1,
            }}
            eventHandlers={{
              click: () => setSelectedAirport(airport),
              popupopen: (event) => {
                activePopupMarkerRef.current = event.target;
                setSelectedAirport(airport);
              },
              popupclose: (event) => {
                if (activePopupMarkerRef.current === event.target) {
                  activePopupMarkerRef.current = null;
                }
              },
            }}
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
                  <span style={{ fontWeight: 600 }}>Phone:</span> {airport.fbo_phone || "N/A"}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Fuel:</span> {airport.fuel_type}_{airport.service_type}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Price:</span> {toDisplayPrice(popupPrice)}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Reported:</span> {popupReported || "N/A"}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>Guaranteed:</span> {popupGuaranteed ? "Yes" : "No"}
                </div>

                <div style={{ paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
                  <div
                    style={{
                      marginBottom: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#475569",
                    }}
                  >
                    Recent airport trend
                  </div>
                  {isLoadingTrend && isSelectedAirport ? (
                    <div style={{ fontSize: 12, color: "#64748b" }}>Loading trend...</div>
                  ) : isSelectedAirport ? (
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
          .filter((a) => a.airport_code === hoveredExtremeAirportCode)
          .map((airport) => (
            <Marker
              key={`top-star-${airport.airport_code}`}
              position={[airport.lat, airport.lon]}
              icon={topStarIcon}
              zIndexOffset={100000}
              interactive={false}
            />
          ))}
    </>
  );

  const mapElement = (
    <MapContainer center={[39.5, -98.35]} zoom={4} style={{ width: "100%", height: "100%" }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapInstanceCapture onReady={setMapInstance} />
      <FitBounds airports={filteredAirports} />
      <MapBoundsWatcher onBoundsChange={setMapBounds} />
      <MapResizeFix deps={[isMobile, mobilePanelOpen, filteredAirports.length]} />
      {renderMarkers()}
    </MapContainer>
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
          <main
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }}
          >
            {mapElement}
          </main>

          <div
            style={{
              position: "absolute",
              top: 12,
              left: 72,
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
              pointerEvents: "none",
            }}
          >
            <div
              onClick={showCredits}
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              title="Show credits"
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>AirFuel Tracker</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {fuelType} · {serviceType}
              </div>
            </div>
            <button
              onClick={() =>
                setMobilePanelOpen((v) => {
                  const nextOpen = !v;
                  trackEvent("toggle_mobile_panel", {
                    state: nextOpen ? "open" : "closed",
                    source: "header_button",
                  });
                  return nextOpen;
                })
              }
              style={{
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "#fff",
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
            >
              {mobilePanelOpen ? "Hide panel" : "Show panel"}
            </button>
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1002,
              pointerEvents: "none",
              display: "flex",
              justifyContent: "center",
              padding: "0 8px 8px",
            }}
          >
            <aside
              onTouchStart={handlePanelTouchStart}
              onTouchMove={handlePanelTouchMove}
              onTouchEnd={finishPanelGesture}
              onTouchCancel={finishPanelGesture}
              style={{
                width: "100%",
                maxWidth: 520,
                maxHeight: "56vh",
                overflow: "hidden",
                borderRadius: 24,
                border: "1px solid #e2e8f0",
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 -12px 32px rgba(0,0,0,0.18)",
                backdropFilter: "blur(8px)",
                transform: mobilePanelOpen ? "translateY(0)" : "translateY(calc(100% - 72px))",
                transition: "transform 0.28s ease",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  padding: "10px 16px 12px",
                  borderBottom: "1px solid #e2e8f0",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none",
                  WebkitUserSelect: "none",
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#334155" }}>
                    Filters & stats
                  </div>
                  <button
                    onClick={() =>
                      setMobilePanelOpen((v) => {
                        const nextOpen = !v;
                        trackEvent("toggle_mobile_panel", {
                          state: nextOpen ? "open" : "closed",
                          source: "panel_button",
                        });
                        return nextOpen;
                      })
                    }
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
              </div>

              <div
                style={{
                  overflowY: "auto",
                  maxHeight: "calc(56vh - 72px)",
                  padding: 16,
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                }}
              >
                {panelContent}
              </div>
            </aside>
          </div>
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

          <main style={{ flex: 1, minWidth: 0, height: "100%" }}>{mapElement}</main>
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
