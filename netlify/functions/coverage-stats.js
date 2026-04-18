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
            ${selectedFuelType}::text IS NULL
            OR (${selectedFuelType} = '100LL' AND a.fuel_raw ILIKE '%100LL%')
            OR (
              ${selectedFuelType} = 'JET_A'
              AND (
                a.fuel_raw ILIKE '%JET A%'
                OR a.fuel_raw ILIKE '%JET-A%'
                OR a.fuel_raw ILIKE '%JET_A%'
              )
            )
            OR (${selectedFuelType} = 'SAF' AND a.fuel_raw ILIKE '%SAF%')
            OR (${selectedFuelType} = 'MOGAS' AND a.fuel_raw ILIKE '%MOGAS%')
            OR (${selectedFuelType} = 'UL94' AND a.fuel_raw ILIKE '%UL94%')
            OR (${selectedFuelType} = 'UL91' AND a.fuel_raw ILIKE '%UL91%')
          )
      ),
      covered_airports AS (
        SELECT DISTINCT a.airport_code
        FROM price_periods p
        JOIN airports_v2 a
          ON a.site_no = p.site_no
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
          AND (${selectedFuelType}::text IS NULL OR p.fuel_type = ${selectedFuelType})
          AND (${selectedServiceType}::text IS NULL OR p.service_type = ${selectedServiceType})
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
            ${selectedFuelType}::text IS NULL
            OR (${selectedFuelType} = '100LL' AND a.fuel_raw ILIKE '%100LL%')
            OR (
              ${selectedFuelType} = 'JET_A'
              AND (
                a.fuel_raw ILIKE '%JET A%'
                OR a.fuel_raw ILIKE '%JET-A%'
                OR a.fuel_raw ILIKE '%JET_A%'
              )
            )
            OR (${selectedFuelType} = 'SAF' AND a.fuel_raw ILIKE '%SAF%')
            OR (${selectedFuelType} = 'MOGAS' AND a.fuel_raw ILIKE '%MOGAS%')
            OR (${selectedFuelType} = 'UL94' AND a.fuel_raw ILIKE '%UL94%')
            OR (${selectedFuelType} = 'UL91' AND a.fuel_raw ILIKE '%UL91%')
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
          AND (${selectedFuelType}::text IS NULL OR p.fuel_type = ${selectedFuelType})
          AND (${selectedServiceType}::text IS NULL OR p.service_type = ${selectedServiceType})
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

    const recentPriceChangeRows = await sql`
      WITH price_history AS (
        SELECT
          p.id,
          a.airport_code,
          a.airport_name,
          a.city,
          a.state,
          COALESCE(NULLIF(BTRIM(p.fbo_name), ''), 'Unknown FBO') AS fbo_name,
          p.fuel_type,
          p.service_type,
          p.valid_from,
          p.valid_from::text AS changed_at,
          p.price AS current_price,
          LAG(p.price) OVER (
            PARTITION BY
              BTRIM(COALESCE(p.site_no::text, '')),
              COALESCE(NULLIF(BTRIM(p.fbo_name), ''), 'Unknown FBO'),
              p.fuel_type,
              p.service_type
            ORDER BY p.valid_from ASC NULLS LAST, p.id ASC
          ) AS previous_price
        FROM price_periods p
        JOIN airports_v2 a
          ON a.site_no = p.site_no
        WHERE UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
          AND p.valid_from IS NOT NULL
          AND (${selectedFuelType}::text IS NULL OR p.fuel_type = ${selectedFuelType})
          AND (${selectedServiceType}::text IS NULL OR p.service_type = ${selectedServiceType})
      )
      SELECT
        id,
        airport_code,
        airport_name,
        city,
        state,
        fbo_name,
        fuel_type,
        service_type,
        changed_at,
        current_price,
        previous_price
      FROM price_history
      WHERE previous_price IS NOT NULL
        AND current_price IS NOT NULL
        AND current_price <> previous_price
      ORDER BY valid_from DESC NULLS LAST, id DESC
      LIMIT 100
    `;

    const row = rows[0] || {};
    const recentPriceChanges = [];
    const recentPriceChangeMap = new Map();

    for (const item of recentPriceChangeRows) {
      const airportCode = item.airport_code || "";
      const airportName = item.airport_name || "";
      const city = item.city || "";
      const state = item.state || "";
      const changedAt = item.changed_at || "";
      const currentPrice = Number(item.current_price);
      const previousPrice = Number(item.previous_price);
      const direction =
        Number.isFinite(currentPrice) && Number.isFinite(previousPrice)
          ? currentPrice > previousPrice
            ? "up"
            : currentPrice < previousPrice
              ? "down"
              : "same"
          : "unknown";

      if (direction === "same" || direction === "unknown") {
        continue;
      }

      const detail = {
        fboName: item.fbo_name || "Unknown FBO",
        fuelType: item.fuel_type || "",
        serviceType: item.service_type || "",
        previousPrice,
        currentPrice,
        direction,
      };

      if (!recentPriceChangeMap.has(airportCode)) {
        if (recentPriceChanges.length >= 5) {
          continue;
        }

        const groupedItem = {
          airportCode,
          airportName,
          city,
          state,
          changedAt,
          details: [detail],
        };

        recentPriceChangeMap.set(airportCode, groupedItem);
        recentPriceChanges.push(groupedItem);
        continue;
      }

      const groupedItem = recentPriceChangeMap.get(airportCode);

      if (groupedItem.details.length < 3) {
        groupedItem.details.push(detail);
      }
    }

    return new Response(
      JSON.stringify({
        totalFuelAirports: Number(row.total_fuel_airports || 0),
        coveredAirports: Number(row.covered_airports || 0),
        remainingAirports: Number(row.remaining_airports || 0),
        attemptedLast24h: Number(row.attempted_last_24h || 0),
        changedLast24h: Number(row.changed_last_24h || 0),
        recentPriceChanges,
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
