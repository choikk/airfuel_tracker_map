import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Search, RefreshCw, Fuel, MapPinned, Filter, TrendingUp } from "lucide-react";

const FUEL_OPTIONS = [
  { value: "100LL", label: "100LL" },
  { value: "JET_A", label: "Jet-A" },
  { value: "MOGAS", label: "MOGAS" },
  { value: "UL94", label: "UL94" },
  { value: "UL91", label: "UL91" },
];

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

function MiniTrend({ points, width = 240, height = 72 }) {
  if (!points || points.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const values = points
    .map((p) => Number(p.avg_price ?? p.price))
    .filter((v) => Number.isFinite(v));

  if (values.length < 2) {
    return <div style={{ fontSize: 12, color: "#64748b" }}>Not enough history</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = 6;
  const usableW = width - padding * 2;
  const usableH = height - padding * 2;

  const coords = values
    .map((v, i) => {
      const x = padding + (i / Math.max(1, values.length - 1)) * usableW;
      const y =
        padding +
        (max === min ? usableH / 2 : (1 - (v - min) / (max - min)) * usableH);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={{ width, maxWidth: "100%" }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <polyline fill="none" stroke="#0284c7" strokeWidth="2" points={coords} />
      </svg>
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
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [highlightedAirportCode, setHighlightedAirportCode] = useState(null);
  const [nationalTrend, setNationalTrend] = useState([]);
  const [regionalTrend, setRegionalTrend] = useState([]);
  const [airportTrend, setAirportTrend] = useState([]);
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

  const nationalStats = useMemo(() => {
    const values = filteredAirports
      .map((a) => Number(a.price))
      .filter((v) => Number.isFinite(v));

    if (!values.length) return { min: null, max: null, avg: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    };
  }, [filteredAirports]);

  const visibleStats = useMemo(() => {
    const values = visibleAirports
      .map((a) => Number(a.price))
      .filter((v) => Number.isFinite(v));

    if (!values.length) return { min: null, max: null, avg: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    };
  }, [visibleAirports]);

  const visibleExtremes = useMemo(() => {
    if (!visibleAirports.length) return { cheapest: null, priciest: null };

    const sorted = [...visibleAirports].sort((a, b) => Number(a.price) - Number(b.price));
    return {
      cheapest: sorted[0],
      priciest: sorted[sorted.length - 1],
    };
  }, [visibleAirports]);

  const visibleVsNational = useMemo(() => {
    if (visibleStats.avg == null || nationalStats.avg == null) return null;

    const diff = visibleStats.avg - nationalStats.avg;
    return {
      diff,
      direction: diff > 0 ? "above" : diff < 0 ? "below" : "equal to",
    };
  }, [visibleStats, nationalStats]);

  useEffect(() => {
    const groups = new Map();

    for (const airport of visibleAirports) {
      const key = airport.reported_date || "Unknown";
      const price = Number(airport.price);
      if (!Number.isFinite(price)) continue;

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
  }, [visibleAirports]);

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

        <PanelSection title="Airports shown" icon={<MapPinned size={14} />}>
          <div style={bigValueStyle}>{visibleAirports.length}</div>
          <div style={tinyMutedStyle}>Visible / matched: {filteredAirports.length}</div>
        </PanelSection>

        <PanelSection title="Visible average" icon={<Filter size={14} />}>
          <div style={bigValueStyle}>
            {visibleStats.avg == null ? "N/A" : `$${visibleStats.avg.toFixed(2)}`}
          </div>
        </PanelSection>

        <div style={cardStyle}>
          <div style={smallTitleStyle}>National average</div>
          <div style={bigValueStyle}>
            {nationalStats.avg == null ? "N/A" : `$${nationalStats.avg.toFixed(2)}`}
          </div>
          <div style={tinyMutedStyle}>
            {visibleVsNational == null
              ? "Comparison unavailable"
              : `Visible region is ${Math.abs(visibleVsNational.diff).toFixed(2)} ${visibleVsNational.direction} national average`}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={smallTitleStyle}>Visible range</div>
          <div style={{ paddingTop: 4, fontSize: 16, fontWeight: 500 }}>
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

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>Lowest in view</div>
          {visibleExtremes.cheapest ? (
            <>
              <div
                style={{ paddingTop: 4, fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.cheapest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
              >
                {visibleExtremes.cheapest.airport_code}
              </div>
              <div
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.cheapest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
              >
                {visibleExtremes.cheapest.airport_name}
              </div>
              <div
                style={{ color: "#64748b", cursor: "pointer" }}
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.cheapest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
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
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.priciest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
              >
                {visibleExtremes.priciest.airport_code}
              </div>
              <div
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.priciest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
              >
                {visibleExtremes.priciest.airport_name}
              </div>
              <div
                style={{ color: "#64748b", cursor: "pointer" }}
                onMouseEnter={() => setHighlightedAirportCode(visibleExtremes.priciest.airport_code)}
                onMouseLeave={() => setHighlightedAirportCode(null)}
              >
                {toDisplayPrice(visibleExtremes.priciest.price)}
              </div>
            </>
          ) : (
            <div style={{ paddingTop: 4, color: "#64748b" }}>N/A</div>
          )}
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

        <PanelSection title="National average trend" icon={<TrendingUp size={14} />}>
          <MiniTrend points={nationalTrend} />
        </PanelSection>

        <PanelSection title="Visible region trend" icon={<TrendingUp size={14} />}>
          <MiniTrend points={regionalTrend} />
        </PanelSection>
      </div>
    </>
  );

  const renderMarkers = () =>
    filteredAirports.map((airport) => {
      const price = Number(airport.price);
      const validPrice = Number.isFinite(price) ? price : null;
      const color = priceToColor(validPrice, visibleStats.min, visibleStats.max);

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
                  <MiniTrend points={airportTrend} />
                ) : (
                  <div style={{ fontSize: 12, color: "#64748b" }}>Tap marker to load trend</div>
                )}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      );
    });

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
