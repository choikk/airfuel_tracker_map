import { neon } from "@neondatabase/serverless";

const EARTH_RADIUS_MILES = 3958.7613;
const BOOST_RADIUS_MILES = 50;

function json(body, init = {}) {
  const { headers = {}, status = 200 } = init;

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export default async (req) => {
  try {
    const method = req.method || "GET";
    if (method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const payload = await req.json().catch(() => ({}));
    const airportCode = String(payload?.airportCode || "").toUpperCase().trim();

    if (!airportCode) {
      return json({ error: "airportCode is required" }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL);

    const airportRows = await sql`
      SELECT airport_code, lat, lon
      FROM airports_v2
      WHERE airport_code = ${airportCode}
      LIMIT 1
    `;

    if (!airportRows.length) {
      return json({ error: `Unknown airportCode: ${airportCode}` }, { status: 404 });
    }

    const airport = airportRows[0];

    if (!Number.isFinite(Number(airport.lat)) || !Number.isFinite(Number(airport.lon))) {
      return json({ error: `Missing coordinates for airportCode: ${airportCode}` }, { status: 400 });
    }

    const result = await sql`
      WITH center_airport AS (
        SELECT
          ${airport.airport_code}::text AS airport_code,
          ${Number(airport.lat)}::double precision AS lat,
          ${Number(airport.lon)}::double precision AS lon
      ),
      eligible AS (
        SELECT s.airport_code
        FROM airport_scrape_status_v2 s
        JOIN airports_v2 a
          ON a.airport_code = s.airport_code
        CROSS JOIN center_airport c
        WHERE s.check_priority < 10
          AND a.lat IS NOT NULL
          AND a.lon IS NOT NULL
          AND (
            a.airport_code = c.airport_code
            OR ${EARTH_RADIUS_MILES} * ACOS(
              LEAST(
                1,
                GREATEST(
                  -1,
                  COS(RADIANS(c.lat)) * COS(RADIANS(a.lat)) *
                  COS(RADIANS(a.lon) - RADIANS(c.lon)) +
                  SIN(RADIANS(c.lat)) * SIN(RADIANS(a.lat))
                )
              )
            ) <= ${BOOST_RADIUS_MILES}
          )
      ),
      updated AS (
        UPDATE airport_scrape_status_v2 s
        SET
          check_priority = 1,
          next_check_at = NOW()
        FROM eligible e
        WHERE s.airport_code = e.airport_code
        RETURNING s.airport_code
      )
      SELECT COUNT(*)::int AS updated_count
      FROM updated
    `;

    return json({
      airportCode,
      radiusMiles: BOOST_RADIUS_MILES,
      updatedCount: Number(result[0]?.updated_count || 0),
    });
  } catch (err) {
    return json({ error: err.message || "Unknown error" }, { status: 500 });
  }
};
