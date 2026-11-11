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

    const airportRows = await sql`
      SELECT site_no, airport_code
      FROM airports_v2
      WHERE airport_code = ${airportCode}
      LIMIT 1
    `;

    if (!airportRows.length) {
      return new Response(
        JSON.stringify({ error: `Unknown airportCode: ${airportCode}` }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const siteNo = airportRows[0].site_no;
    const canonicalAirportCode = airportRows[0].airport_code;

    const pointsDesc = await sql`
      SELECT
        ${canonicalAirportCode}::text AS airport_code,
        p.fbo_name,
        p.fuel_type,
        p.service_type,
        p.price,
        p.reported_date,
        p.guaranteed,
        p.valid_from::text AS valid_from
      FROM price_periods p
      WHERE p.site_no = ${siteNo}
        AND p.fuel_type = ${fuelType}
        AND p.service_type = ${serviceType}
      ORDER BY p.valid_from DESC, p.id DESC
      LIMIT 30
    `;

    const points = [...pointsDesc].reverse();

    return new Response(
      JSON.stringify({
        airportCode: canonicalAirportCode,
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
      JSON.stringify({ error: err.message || "Unknown error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
};
