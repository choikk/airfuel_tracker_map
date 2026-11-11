import { neon } from "@neondatabase/serverless";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const fuelType = (url.searchParams.get("fuelType") || "100LL").toUpperCase();
    const serviceType = (url.searchParams.get("serviceType") || "FULL").toUpperCase();

    const allowedFuelTypes = ["100LL", "JET_A", "SAF", "MOGAS", "UL94", "UL91"];
    const allowedServiceTypes = ["FULL", "SELF", "RA"];

    if (!allowedFuelTypes.includes(fuelType)) {
      return new Response(
        JSON.stringify({ error: `Invalid fuelType: ${fuelType}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!allowedServiceTypes.includes(serviceType)) {
      return new Response(
        JSON.stringify({ error: `Invalid serviceType: ${serviceType}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const sql = neon(process.env.NEON_DATABASE_URL);

    const phoneColumnRows = await sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'price_periods'
          AND column_name = 'fbo_phone'
      ) AS has_fbo_phone
    `;

    const hasFboPhone = Boolean(phoneColumnRows[0]?.has_fbo_phone);

    const airports = hasFboPhone
      ? await sql`
          WITH latest_open AS (
            SELECT DISTINCT ON (p.site_no)
              p.site_no,
              p.airport_code,
              p.fbo_name,
              p.fbo_phone,
              p.fuel_type,
              p.service_type,
              p.price,
              p.reported_date,
              p.guaranteed,
              p.valid_from,
              p.last_seen_at
            FROM price_periods p
            WHERE p.valid_to IS NULL
              AND p.fuel_type = ${fuelType}
              AND p.service_type = ${serviceType}
              AND p.site_no IS NOT NULL
            ORDER BY
              p.site_no,
              p.reported_date DESC NULLS LAST,
              p.price ASC,
              p.valid_from DESC,
              p.id DESC
          )
          SELECT
            a.airport_code,
            a.airport_name,
            a.city,
            a.state,
            a.lat,
            a.lon,
            l.fbo_name,
            l.fbo_phone,
            l.fuel_type,
            l.service_type,
            l.price,
            l.reported_date,
            l.guaranteed,
            l.valid_from,
            l.last_seen_at
          FROM latest_open l
          JOIN airports_v2 a
            ON a.site_no = l.site_no
          WHERE a.lat IS NOT NULL
            AND a.lon IS NOT NULL
          ORDER BY a.airport_code ASC
        `
      : await sql`
          WITH latest_open AS (
            SELECT DISTINCT ON (p.site_no)
              p.site_no,
              p.airport_code,
              p.fbo_name,
              p.fuel_type,
              p.service_type,
              p.price,
              p.reported_date,
              p.guaranteed,
              p.valid_from,
              p.last_seen_at
            FROM price_periods p
            WHERE p.valid_to IS NULL
              AND p.fuel_type = ${fuelType}
              AND p.service_type = ${serviceType}
              AND p.site_no IS NOT NULL
            ORDER BY
              p.site_no,
              p.reported_date DESC NULLS LAST,
              p.price ASC,
              p.valid_from DESC,
              p.id DESC
          )
          SELECT
            a.airport_code,
            a.airport_name,
            a.city,
            a.state,
            a.lat,
            a.lon,
            l.fbo_name,
            NULL::text AS fbo_phone,
            l.fuel_type,
            l.service_type,
            l.price,
            l.reported_date,
            l.guaranteed,
            l.valid_from,
            l.last_seen_at
          FROM latest_open l
          JOIN airports_v2 a
            ON a.site_no = l.site_no
          WHERE a.lat IS NOT NULL
            AND a.lon IS NOT NULL
          ORDER BY a.airport_code ASC
        `;

    const nationalTrend = await sql`
      SELECT
        p.reported_date::text AS date,
        ROUND(AVG(p.price)::numeric, 2) AS avg_price
      FROM price_periods p
      JOIN airports_v2 a
        ON a.site_no = p.site_no
      WHERE p.valid_to IS NULL
        AND p.fuel_type = ${fuelType}
        AND p.service_type = ${serviceType}
        AND p.reported_date IS NOT NULL
        AND p.reported_date >= CURRENT_DATE - INTERVAL '90 days'
        AND a.lat IS NOT NULL
        AND a.lon IS NOT NULL
        AND UPPER(COALESCE(a.state, '')) NOT LIKE '%CANADA%'
      GROUP BY p.reported_date
      ORDER BY p.reported_date ASC
    `;

    const databaseMetaRows = await sql`
      SELECT MAX(ts)::text AS database_updated_at
      FROM (
        SELECT MAX(p.valid_from) AS ts
        FROM price_periods p
        WHERE p.valid_from IS NOT NULL

        UNION ALL

        SELECT MAX(p.last_seen_at) AS ts
        FROM price_periods p
        WHERE p.last_seen_at IS NOT NULL

        UNION ALL

        SELECT MAX(p.reported_date::timestamp) AS ts
        FROM price_periods p
        WHERE p.reported_date IS NOT NULL
      ) latest_updates
    `;

    const databaseUpdatedAt = databaseMetaRows[0]?.database_updated_at || "";

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        databaseUpdatedAt,
        fuelType,
        serviceType,
        airports,
        nationalTrend,
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
