import { neon } from "@neondatabase/serverless";

export default async () => {
  try {
    const sql = neon(process.env.NEON_DATABASE_URL);

    const rows = await sql`
      WITH fuel_airports AS (
        SELECT DISTINCT airport_code
        FROM airports
        WHERE UPPER(COALESCE(state, '')) NOT LIKE '%CANADA%'
          AND fuel_raw IS NOT NULL
          AND BTRIM(fuel_raw) <> ''
          AND (
            fuel_raw ILIKE '%100LL%'
            OR fuel_raw ILIKE '%JET A%'
            OR fuel_raw ILIKE '%JET-A%'
            OR fuel_raw ILIKE '%SAF%'
            OR fuel_raw ILIKE '%MOGAS%'
            OR fuel_raw ILIKE '%UL94%'
            OR fuel_raw ILIKE '%UL91%'
          )
      ),
      covered_airports AS (
        SELECT DISTINCT p.airport_code
        FROM price_periods p
        JOIN airports a
          ON a.airport_code = p.airport_code
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
      ),
      attempted_last_24h AS (
        SELECT COUNT(DISTINCT airport_code) AS cnt
        FROM airports
        WHERE UPPER(COALESCE(state, '')) NOT LIKE '%CANADA%'
          AND fuel_raw IS NOT NULL
          AND BTRIM(fuel_raw) <> ''
          AND (
            fuel_raw ILIKE '%100LL%'
            OR fuel_raw ILIKE '%JET A%'
            OR fuel_raw ILIKE '%JET-A%'
            OR fuel_raw ILIKE '%SAF%'
            OR fuel_raw ILIKE '%MOGAS%'
            OR fuel_raw ILIKE '%UL94%'
            OR fuel_raw ILIKE '%UL91%'
          )
          AND last_checked_at IS NOT NULL
          AND last_checked_at >= NOW() - INTERVAL '24 hours'
      ),
      changed_last_24h AS (
        SELECT COUNT(DISTINCT p.airport_code) AS cnt
        FROM price_periods p
        JOIN airports a
          ON a.airport_code = p.airport_code
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

    const row = rows[0] || {};

    return new Response(
      JSON.stringify({
        totalFuelAirports: Number(row.total_fuel_airports || 0),
        coveredAirports: Number(row.covered_airports || 0),
        remainingAirports: Number(row.remaining_airports || 0),
        attemptedLast24h: Number(row.attempted_last_24h || 0),
        changedLast24h: Number(row.changed_last_24h || 0),
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
      JSON.stringify({
        error: err.message || "Unknown error",
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
