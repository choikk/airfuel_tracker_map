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
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    if (!allowedServiceTypes.includes(serviceType)) {
      return new Response(
        JSON.stringify({ error: `Invalid serviceType: ${serviceType}` }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const sql = neon(process.env.NEON_DATABASE_URL);

    const airports = await sql`
      SELECT DISTINCT ON (p.airport_code)
        p.airport_code,
        a.airport_name,
        a.city,
        a.state,
        a.lat,
        a.lon,
        p.fbo_name,
        p.fuel_type,
        p.service_type,
        p.price,
        p.reported_date,
        p.guaranteed,
        p.valid_from,
        p.last_seen_at
      FROM price_periods p
      JOIN airports a
        ON a.airport_code = p.airport_code
      WHERE p.valid_to IS NULL
        AND p.fuel_type = ${fuelType}
        AND p.service_type = ${serviceType}
        AND a.lat IS NOT NULL
        AND a.lon IS NOT NULL
      ORDER BY
        p.airport_code,
        p.reported_date DESC NULLS LAST,
        p.price ASC,
        p.valid_from DESC
    `;

    const nationalTrend = await sql`
      SELECT
        p.reported_date::text AS date,
        ROUND(AVG(p.price)::numeric, 2) AS avg_price
      FROM price_periods p
      JOIN airports a
        ON a.airport_code = p.airport_code
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

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
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
