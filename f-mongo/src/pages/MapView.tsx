import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapViewProps {
  country: string;
  city: string;
  street: string;
  source: "MongoDB" | "Google";
  coords: { lat: number; lng: number } | null;
  /** MongoDB‑ისთვის – ქუჩის ხაზის კოორდინატები (MultiLineString) */
  path?: number[][][];
}

const MapView: React.FC<MapViewProps> = ({
  country,
  city,
  street,
  source,
  coords,
  path,
}) => {
  const [loading, setLoading] = useState(true);

  // 1. მარკერის პოზიცია (ყოველთვის ერთი წერტილი)
  const markerPos = useMemo<[number, number] | null>(() => {
    if (!coords) return null;
    return [coords.lat, coords.lng];
  }, [coords]);

  // 2. რუკის ფიტვა – bounds
  const bounds = useMemo<LatLngBounds | null>(() => {
    if (!coords) return null;

    // თუ გვაქვს path (MongoDB) → გამოვთვალოთ bounds ხაზისთვის
    if (source === "MongoDB" && path && path.length > 0) {
      const flat = path.flat(2); // [[lng,lat], ...]
      const lats = flat.filter((_, i) => i % 2 === 1);
      const lngs = flat.filter((_, i) => i % 2 === 0);
      return new LatLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      );
    }

    // Google – მხოლოდ ერთი წერტილი
    const pad = 0.005; // ~500მ
    return new LatLngBounds(
      [coords.lat - pad, coords.lng - pad],
      [coords.lat + pad, coords.lng + pad]
    );
  }, [coords, source, path]);

  // 3. Loading
  useEffect(() => {
    setLoading(!coords);
  }, [coords]);

  if (loading || !coords) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
        მიმდინარეობს რუკის ჩატვირთვა...
      </div>
    );
  }

  return (
    <div className="w-full h-96 mt-6 rounded-lg overflow-hidden shadow-lg">
      <MapContainer
        center={markerPos!}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        {markerPos && (
          <Marker position={markerPos}>
            <Popup>
              <strong>{city}</strong>
              <br />
              {street}
              <br />
              {country}
            </Popup>
          </Marker>
        )}
        {/* ავტომატური ზუმი bounds‑ზე */}
        {bounds && <FitBounds bounds={bounds} />}
        {/* MongoDB – ხაზის დახატვა */}
        {source === "MongoDB" && path && <PolylinePath path={path} />}
      </MapContainer>
    </div>
  );
};

// ---------- Helper Components ----------

/** ავტომატური ზუმი bounds‑ზე */
const FitBounds: React.FC<{ bounds: LatLngBounds }> = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }, [map, bounds]);
  return null;
};

/** ქუჩის ხაზის (MultiLineString) დახატვა */
const PolylinePath: React.FC<{ path: number[][][] }> = ({ path }) => {
  const map = useMap();
  useEffect(() => {
    const polylines = path.map((line) =>
      L.polyline(line.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.8,
      }).addTo(map)
    );
    return () => {
      polylines.forEach((p) => map.removeLayer(p));
    };
  }, [map, path]);
  return null;
};

export default MapView;