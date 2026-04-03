import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";

function toDisplayPrice(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "N/A";
  return `$${n.toFixed(2)}`;
}

function priceToColor(price, min, max) {
  if (price == null) return "#94a3b8";
  if (min == null || max == null || min === max) return "#eab308";

  const ratio = (price - min) / (max - min);

  if (ratio <= 0.15) return "#166534";
  if (ratio <= 0.3) return "#16a34a";
  if (ratio <= 0.45) return "#65a30d";
  if (ratio <= 0.6) return "#eab308";
  if (ratio <= 0.75) return "#f59e0b";
  if (ratio <= 0.9) return "#ef4444";
  return "#b91c1c";
}

export default function App() {
  const [fuelType, setFuelType] = useState("100LL");
  const [serviceType, setServiceType] = useState("FULL");
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/.netlify/functions/airports-map?fuelType=${fuelType}&serviceType=${serviceType}`
        );
        const data = await res.json();
        setAirports(data.airports || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [fuelType, serviceType]);

  const priceStats = useMemo(() => {
    const values = airports
      .map((a) => Number(a.price))
      .filter((v) => Number.isFinite(v));

    if (!values.length) return { min: null, max: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [airports]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div
        style={{
          width: "20%",
          minWidth: "260px",
          borderRight: "1px solid #ddd",
          padding: "16px",
          background: "#fff",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0 }}>AirFuel Tracker</h2>

        <div style={{ marginBottom: "12px" }}>
          <label>Fuel Type</label>
          <br />
          <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}>
            <option value="100LL">100LL</option>
            <option value="JET_A">Jet-A</option>
            <option value="MOGAS">MOGAS</option>
            <option value="UL94">UL94</option>
            <option value="UL91">UL91</option>
          </select>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label>Service Type</label>
          <br />
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            <option value="FULL">Full</option>
            <option value="SELF">Self</option>
            <option value="RA">Restricted</option>
          </select>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <strong>Airports shown:</strong> {airports.length}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <strong>Status:</strong> {loading ? "Loading..." : "Loaded"}
        </div>

        <div>
          <strong>Price palette</strong>
          <div style={{ display: "flex", height: "14px", marginTop: "8px", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ flex: 1, background: "#166534" }} />
            <div style={{ flex: 1, background: "#16a34a" }} />
            <div style={{ flex: 1, background: "#65a30d" }} />
            <div style={{ flex: 1, background: "#eab308" }} />
            <div style={{ flex: 1, background: "#f59e0b" }} />
            <div style={{ flex: 1, background: "#ef4444" }} />
            <div style={{ flex: 1, background: "#b91c1c" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "4px" }}>
            <span>Lower</span>
            <span>Higher</span>
          </div>
        </div>
      </div>

      <div style={{ width: "80%", height: "100%" }}>
        <MapContainer center={[39.5, -98.35]} zoom={4} style={{ width: "100%", height: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {airports.map((airport) => {
            const price = Number(airport.price);
            const color = priceToColor(
              Number.isFinite(price) ? price : null,
              priceStats.min,
              priceStats.max
            );

            return (
              <CircleMarker
                key={`${airport.airport_code}-${airport.fbo_name}-${airport.fuel_type}-${airport.service_type}`}
                center={[airport.lat, airport.lon]}
                radius={7}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div>{airport.airport_code} · {toDisplayPrice(airport.price)}</div>
                </Tooltip>

                <Popup>
                  <div>
                    <div><strong>{airport.airport_code}</strong></div>
                    <div>{airport.airport_name}</div>
                    <div>{airport.city}, {airport.state}</div>
                    <hr />
                    <div>FBO: {airport.fbo_name}</div>
                    <div>Fuel: {airport.fuel_type}_{airport.service_type}</div>
                    <div>Price: {toDisplayPrice(airport.price)}</div>
                    <div>Reported: {airport.reported_date || "N/A"}</div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
