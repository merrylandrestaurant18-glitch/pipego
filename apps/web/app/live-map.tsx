"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";

export type MapPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  kind: "customer" | "provider";
};

function MapViewport({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 13, { animate: true });
  }, [center, map]);

  return null;
}

export default function LiveMap({
  center,
  points,
  className,
}: {
  center: [number, number];
  points: MapPoint[];
  className?: string;
}) {
  return (
    <div className={`live-map ${className ?? ""}`}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className="live-map-canvas">
        <MapViewport center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.latitude, point.longitude]}
            radius={point.kind === "customer" ? 8 : 9}
            pathOptions={{
              color: "#fff",
              weight: 3,
              fillColor: point.kind === "customer" ? "#337bd1" : "#276c55",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -7]}>{point.label}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
