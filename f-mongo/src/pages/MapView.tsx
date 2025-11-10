// src/components/MapView.tsx
import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
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
  houseNumber?: string;
  source: "MongoDB" | "Google";
  coords: { lat: number; lng: number };
  path?: number[][][];
  interpolated?: { lat: number; lng: number } | null;
}

const MapView: React.FC<MapViewProps> = ({
  country,
  city,
  street,
  houseNumber,
  source,
  coords,
  path,
  interpolated,
}) => {
  const displayCoords = interpolated || coords;
  const markerPos: [number, number] = [displayCoords.lat, displayCoords.lng];

  const bounds = useMemo<LatLngBounds | null>(() => {
    if (source === "MongoDB" && path && path.length > 0) {
      const flat = path.flat(2);
      const lats = flat.filter((_, i) => i % 2 === 1);
      const lngs = flat.filter((_, i) => i % 2 === 0);
      return new LatLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
      );
    }
    const pad = 0.001;
    return new LatLngBounds(
      [displayCoords.lat - pad, displayCoords.lng - pad],
      [displayCoords.lat + pad, displayCoords.lng + pad]
    );
  }, [displayCoords, source, path]);

  return (
    <MapContainer
      center={markerPos}
      zoom={houseNumber ? 19 : 17}
      style={{ height: "100%", width: "100%" }}
      className="rounded-2xl"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <Marker
        position={markerPos}
        icon={L.divIcon({
          className: "custom-marker",
          html: `<div style="
            background: #1d4ed8;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            border: 4px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          ">${houseNumber || "?"}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        })}
      >
        <Popup>
          <div className="text-center font-semibold">
            <div>{city}</div>
            <div className="text-sm">{street} {houseNumber && `#${houseNumber}`}</div>
            <div className="text-xs text-gray-600">{country}</div>
          </div>
        </Popup>
      </Marker>

      {source === "MongoDB" && path && <PolylinePath path={path} />}
      <FitToPoint point={displayCoords} zoom={houseNumber ? 19 : 17} />
    </MapContainer>
  );
};

const FitToPoint: React.FC<{ point: { lat: number; lng: number }; zoom: number }> = ({ point, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([point.lat, point.lng], zoom, { animate: true, duration: 1 });
  }, [point, zoom, map]);
  return null;
};

const PolylinePath: React.FC<{ path: number[][][] }> = ({ path }) => {
  const map = useMap();
  useEffect(() => {
    const polylines = path.map((line) =>
      L.polyline(line.map(([lng, lat]) => [lat, lng] as [number, number]), {
        color: "#3b82f6",
        weight: 5,
        opacity: 0.9,
      }).addTo(map)
    );
    return () => {
      polylines.forEach((p) => map.removeLayer(p));
    };
  }, [map, path]);
  return null;
};

export default MapView;