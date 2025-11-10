import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = 5000;
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let db;

async function connectDB() {
  await client.connect();
  db = client.db("georgia");
  console.log("MongoDB connected!");
}
connectDB();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error("GOOGLE_API_KEY is missing in .env!");
  process.exit(1);
}

const normalize = (str) =>
  str?.toLowerCase().trim().replace(/[^a-z0-9ა-ჰ]/g, "") || "";

const isGeorgia = (country) => {
  const norm = normalize(country);
  return ["საქართველო", "georgia", "sakartvelo"].includes(norm);
};

const escapeRegex = (string) => string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');

app.get("/api/cities", async (req, res) => {
  const { q, country } = req.query;
  if (!q || q.length < 2) return res.json([]);
  if (!isGeorgia(country?.toString())) return res.json([]);
  try {
    const cities = await db
      .collection("places")
      .find({ name: { $regex: new RegExp(`^${escapeRegex(q)}`, "i") } })
      .limit(10)
      .project({ name: 1, _id: 0 })
      .toArray();
    res.json(cities.map((c) => c.name));
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.get("/api/streets", async (req, res) => {
  const { city, q, country } = req.query;
  if (!city || !q || q.length < 2) return res.json([]);
  if (!isGeorgia(country?.toString())) return res.json([]);
  try {
    const place = await db
      .collection("places")
      .findOne({ name: { $regex: new RegExp(`^${escapeRegex(city)}$`, "i") } });
    if (!place) return res.json([]);
    const [lng, lat] = place.loc.coordinates;
    const streets = await db
      .collection("roads")
      .find({
        name: { $regex: new RegExp(escapeRegex(q), "i") },
        path: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 30000,
          },
        },
      })
      .limit(10)
      .project({ name: 1, _id: 0 })
      .toArray();
    res.json(streets.map((s) => s.name));
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// POST /api/validate-address
app.post("/api/validate-address", async (req, res) => {
  const { country, city, street, houseNumber } = req.body;

  if (!country || !city || !street) {
    return res.status(400).json({ success: false, message: "ყველა ველი სავალდებულოა." });
  }

  if (isGeorgia(country)) {
    try {
      const place = await db
        .collection("places")
        .findOne({ name: { $regex: new RegExp(`^${escapeRegex(city)}$`, "i") } });
      if (!place) {
        return res.json({ success: false, message: `ქალაქი "${city}" ვერ მოიძებნა.` });
      }

      const [lng, lat] = place.loc.coordinates;
      const query = {
        name: { $regex: new RegExp(`^${escapeRegex(street)}$`, "i") },
        path: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 30000,
          },
        },
      };

      const road = await db.collection("roads").findOne(query);
      if (!road) {
        return res.json({
          success: false,
          message: `ქუჩა "${street}" არ არის ${city}-ის მახლობლად (30 კმ-ში).`,
        });
      }

      // === ინტერპოლაცია houseNumber-ით ===
      let finalCoords = null;
      let path = road.path.coordinates;

      if (houseNumber && path && path.length > 0) {
        const num = parseInt(houseNumber.replace(/\D/g, ""), 10);
        if (!isNaN(num)) {
          const interpolated = interpolateHouseNumber(path, num);
          if (interpolated) {
            finalCoords = interpolated;
          }
        }
      }

      // თუ ინტერპოლაცია არ მოხდა → ცენტროიდი
      if (!finalCoords) {
        const points = [];
        path.forEach((line) => line.forEach((pt) => points.push(pt)));
        const sumLng = points.reduce((s, [lng]) => s + lng, 0);
        const sumLat = points.reduce((s, [, lat]) => s + lat, 0);
        finalCoords = { lat: sumLat / points.length, lng: sumLng / points.length };
      }

      return res.json({
        success: true,
        message: `მისამართი "${city}, ${street}${houseNumber ? ` ${houseNumber}` : ""}" ვალიდურია`,
        source: "MongoDB",
        coords: finalCoords,
        path: road.path.coordinates,
        interpolated: houseNumber ? finalCoords : null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "MongoDB შეცდომა" });
    }
  } else {
    // Google API (უცვლელი)
    const fullAddress = `${street} ${houseNumber || ""}, ${city}, ${country}`.trim();
    const encoded = encodeURIComponent(fullAddress);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_API_KEY}&language=ka`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== "OK" || !data.results?.length) {
        return res.json({ success: false, message: "მისამართი ვერ მოიძებნა (Google)" });
      }
      const result = data.results[0];
      return res.json({
        success: true,
        message: `მისამართი ვალიდურია (Google)`,
        formatted_address: result.formatted_address,
        source: "Google",
        coords: {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "Google API შეცდომა" });
    }
  }
});

// === ინტერპოლაციის ფუნქცია ===
function interpolateHouseNumber(path, houseNumber) {
  let totalLength = 0;
  const segments = [];

  // გამოვთვალოთ სეგმენტების სიგრძე
  for (const line of path) {
    for (let i = 0; i < line.length - 1; i++) {
      const p1 = line[i];
      const p2 = line[i + 1];
      const dist = haversine(p1[1], p1[0], p2[1], p2[0]);
      totalLength += dist;
      segments.push({ p1, p2, dist, start: totalLength - dist });
    }
  }

  if (totalLength === 0) return null;

  // ვივარაუდოთ, რომ ნომრები თანაბრად ნაწილდება
  const targetDistance = (houseNumber / 1000) * totalLength; // მაგ: 1-1000

  let accumulated = 0;
  for (const seg of segments) {
    if (accumulated + seg.dist >= targetDistance) {
      const ratio = (targetDistance - accumulated) / seg.dist;
      const lat = seg.p1[1] + ratio * (seg.p2[1] - seg.p1[1]);
      const lng = seg.p1[0] + ratio * (seg.p2[0] - seg.p1[0]);
      return { lat, lng };
    }
    accumulated += seg.dist;
  }

  // ბოლო წერტილი
  const last = path[path.length - 1];
  return { lat: last[last.length - 1][1], lng: last[last.length - 1][0] };
}

// Haversine ფორმულა
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371000; // მეტრებში
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`MongoDB (საქართველო) + Google (სხვა)`);
});