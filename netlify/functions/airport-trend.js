import { neon } from "@neondatabase/serverless";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const airportCode = (url.searchParams.get("airportCode") || "").toUpperCase().trim();
    const fuelType = (url.searchParams.get("fuelType") || "100LL").toUpperCase();
    const serviceType = (url.searchParams.get("serviceType") || "FULL").toUpperCase();

    const allowedFuelTypes = ["100LL", "JET_A", "SAF", "MOGAS", "UL94", "UL91"];
    const allowedServiceTypes = ["FULL", "SELF", "RA"];

    if (!airportCode) {
      return new Response(
        JSON.stringify({ error: "airportCode is required" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

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

    const pointsDesc = await sql`
      SELECT
        airport_code,
        fbo_name,
        fuel_type,
        service_type,
        price,
        reported_date,
        guaranteed,
        valid_from::text AS valid_from
      FROM price_periods
      WHERE airport_code = ${airportCode}
        AND fuel_type = ${fuelType}
        AND service_type = ${serviceType}
      ORDER BY valid_from DESC
      LIMIT 30
    `;

    const points = [...pointsDesc].reverse();

    return new Response(
      JSON.stringify({
        airportCode,
        fuelType,
        serviceType,
        points,
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
