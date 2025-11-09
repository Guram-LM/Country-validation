import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";


delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapViewProps {
  country: string;
  city: string;
  street: string;
  source: "MongoDB" | "Google";
}

const MapView: React.FC<MapViewProps> = ({ country, city, street, source }) => {
  const [center, setCenter] = useState<[number, number]>([42.0, 43.5]);
  const [marker, setMarker] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);

  const isGeorgia = country === "საქართველო" || country.toLowerCase() === "georgia";

  useEffect(() => {
    const fetchCoords = async () => {
      setLoading(true);

      if (isGeorgia && source === "MongoDB") {

        try {
          const res = await fetch(`http://localhost:5000/api/cities?q=${encodeURIComponent(city)}&country=საქართველო`);
          const cities = await res.json();
          if (cities.length > 0) {

            const placeRes = await fetch(`http://localhost:5000/api/validate-address`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ country: "საქართველო", city, street: "any" })
            });
            const data = await placeRes.json();
            if (data.success) {

              const mockCoords: Record<string, [number, number]> = {
                "თბილისი": [41.7151, 44.8271],
                "ბათუმი": [41.6367, 41.6339],
                "ქუთაისი": [42.2496, 42.7000],
                "რუსთავი": [41.5225, 44.9733],
                "გორი": [41.9814, 44.1130],
              };
              const coords = mockCoords[city] || [42.0, 43.5];
              setCenter(coords);
              setMarker(coords);
            }
          }
        } catch (err) {
          console.error("MongoDB coords error:", err);
        }
      } else {

        const fullAddress = `${street}, ${city}, ${country}`;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${import.meta.env.VITE_GOOGLE_API_KEY}&language=en`;

        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.results?.[0]) {
            const loc = data.results[0].geometry.location;
            const coords: [number, number] = [loc.lat, loc.lng];
            setCenter(coords);
            setMarker(coords);
          }
        } catch (err) {
          console.error("Google Geocode error:", err);
        }
      }

      setLoading(false);
    };

    fetchCoords();
  }, [country, city, street, source, isGeorgia]);

  if (loading) {
    return <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">მიმდინარეობს რუკის ჩატვირთვა...</div>;
  }

  return (
    <div className="w-full h-96 mt-6 rounded-lg overflow-hidden shadow-lg">
      <MapContainer center={center} zoom={isGeorgia ? 12 : 14} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {marker && (
          <Marker position={marker}>
            <Popup>
              <strong>{city}</strong><br />
              {street}<br />
              {country}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapView;