import { neon } from "@neondatabase/serverless";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const fuelType = (url.searchParams.get("fuelType") || "").toUpperCase();
    const serviceType = (url.searchParams.get("serviceType") || "").toUpperCase();
    const allowedFuelTypes = ["100LL", "JET_A", "SAF", "MOGAS", "UL94", "UL91"];
    const allowedServiceTypes = ["FULL", "SELF", "RA"];
    const selectedFuelType = allowedFuelTypes.includes(fuelType) ? fuelType : null;
    const selectedServiceType = allowedServiceTypes.includes(serviceType) ? serviceType : null;

    const sql = neon(process.env.NEON_DATABASE_URL);

    const rows = await sql`
      WITH fuel_airports AS (
        SELECT DISTINCT a.airport_code
        FROM airports_v2 a
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
          AND a.fuel_raw IS NOT NULL
          AND BTRIM(a.fuel_raw) <> ''
          AND UPPER(BTRIM(a.fuel_raw)) <> 'NONE'
          AND (
            a.fuel_raw ILIKE '%100LL%'
            OR a.fuel_raw ILIKE '%JET A%'
            OR a.fuel_raw ILIKE '%JET-A%'
            OR a.fuel_raw ILIKE '%JET_A%'
            OR a.fuel_raw ILIKE '%SAF%'
            OR a.fuel_raw ILIKE '%MOGAS%'
            OR a.fuel_raw ILIKE '%UL94%'
            OR a.fuel_raw ILIKE '%UL91%'
          )
      ),
      covered_airports AS (
        SELECT DISTINCT a.airport_code
        FROM price_periods p
        JOIN airports_v2 a
          ON a.site_no = p.site_no
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
      ),
      attempted_last_24h AS (
        SELECT COUNT(DISTINCT s.airport_code) AS cnt
        FROM airport_scrape_status_v2 s
        JOIN airports_v2 a
          ON a.airport_code = s.airport_code
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
          AND a.fuel_raw IS NOT NULL
          AND BTRIM(a.fuel_raw) <> ''
          AND UPPER(BTRIM(a.fuel_raw)) <> 'NONE'
          AND (
            a.fuel_raw ILIKE '%100LL%'
            OR a.fuel_raw ILIKE '%JET A%'
            OR a.fuel_raw ILIKE '%JET-A%'
            OR a.fuel_raw ILIKE '%JET_A%'
            OR a.fuel_raw ILIKE '%SAF%'
            OR a.fuel_raw ILIKE '%MOGAS%'
            OR a.fuel_raw ILIKE '%UL94%'
            OR a.fuel_raw ILIKE '%UL91%'
          )
          AND s.last_checked_at IS NOT NULL
          AND s.last_checked_at >= NOW() - INTERVAL '24 hours'
      ),
      changed_last_24h AS (
        SELECT COUNT(DISTINCT a.airport_code) AS cnt
        FROM price_periods p
        JOIN airports_v2 a
          ON a.site_no = p.site_no
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
          AND p.valid_from IS NOT NULL
          AND p.valid_from >= NOW() - INTERVAL '24 hours'
      )
      SELECT
        (SELECT COUNT(*) FROM fuel_airports) AS total_fuel_airports,
        (
          SELECT COUNT(*)
          FROM fuel_airports f
          JOIN covered_airports c
            ON f.airport_code = c.airport_code
        ) AS covered_airports,
        (
          SELECT COUNT(*)
          FROM fuel_airports f
          LEFT JOIN covered_airports c
            ON f.airport_code = c.airport_code
          WHERE c.airport_code IS NULL
        ) AS remaining_airports,
        (SELECT cnt FROM attempted_last_24h) AS attempted_last_24h,
        (SELECT cnt FROM changed_last_24h) AS changed_last_24h
    `;

    const recentPriceChanges = await sql`
      SELECT DISTINCT ON (a.airport_code)
        a.airport_code,
        a.airport_name,
        p.valid_from::text AS changed_at
      FROM price_periods p
      JOIN airports_v2 a
        ON a.site_no = p.site_no
      WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
        AND p.valid_from IS NOT NULL
        AND p.valid_to IS NULL
        AND (${selectedFuelType}::text IS NULL OR p.fuel_type = ${selectedFuelType})
        AND (${selectedServiceType}::text IS NULL OR p.service_type = ${selectedServiceType})
      ORDER BY
        a.airport_code,
        p.valid_from DESC,
        p.price ASC
    `;

    const row = rows[0] || {};
    const topRecentPriceChanges = [...recentPriceChanges]
      .sort((a, b) => Date.parse(b.changed_at || "") - Date.parse(a.changed_at || ""))
      .slice(0, 5)
      .map((item) => ({
        airportCode: item.airport_code || "",
        airportName: item.airport_name || "",
        changedAt: item.changed_at || "",
      }));

    return new Response(
      JSON.stringify({
        totalFuelAirports: Number(row.total_fuel_airports || 0),
        coveredAirports: Number(row.covered_airports || 0),
        remainingAirports: Number(row.remaining_airports || 0),
        attemptedLast24h: Number(row.attempted_last_24h || 0),
        changedLast24h: Number(row.changed_last_24h || 0),
        recentPriceChanges: topRecentPriceChanges,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=60",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
