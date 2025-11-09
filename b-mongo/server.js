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

app.post("/api/validate-address", async (req, res) => {
  const { country, city, street } = req.body;
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
      const road = await db.collection("roads").findOne({
        name: { $regex: new RegExp(`^${escapeRegex(street)}$`, "i") },
        path: {
          $near: {
            $geometry: { type: "Point", coordinates: [lng, lat] },
            $maxDistance: 30000,
          },
        },
      });
      if (!road) {
        return res.json({
          success: false,
          message: `ქუჩა "${street}" არ არის ${city}-ის მახლობლად (30 კმ-ში).`,
        });
      }
      // Compute centroid for road
      let points = [];
      road.path.coordinates.forEach((line) => {
        line.forEach((pt) => points.push(pt));
      });
      if (points.length === 0) {
        return res.json({ success: false, message: "ქუჩის კოორდინატები ვერ მოიძებნა." });
      }
      const sumLng = points.reduce((sum, [lng]) => sum + lng, 0);
      const sumLat = points.reduce((sum, [, lat]) => sum + lat, 0);
      const count = points.length;
      const avgLng = sumLng / count;
      const avgLat = sumLat / count;

      return res.json({
        success: true,
        message: `მისამართი "${city}, ${street}" ვალიდურია`,
        source: "MongoDB",
        coords: { lat: avgLat, lng: avgLng },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: "MongoDB შეცდომა" });
    }
  } else {
    const fullAddress = `${street}, ${city}, ${country}`;
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

app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`MongoDB (საქართველო) + Google (სხვა)`);
});