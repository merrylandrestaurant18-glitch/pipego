import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Coordinates = { latitude: number; longitude: number };
export type MapPoint = Coordinates & {
  id: string;
  label: string;
  kind: "customer" | "provider";
};

export default function LiveMap({
  center,
  points,
}: {
  center: Coordinates;
  points: MapPoint[];
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: true }).setView(
      [center.latitude, center.longitude],
      13,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    markers.current = L.layerGroup().addTo(instance);
    requestAnimationFrame(() => instance.invalidateSize());
    return () => {
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    const markerLayer = markers.current;
    if (!instance || !markerLayer) return;
    instance.setView([center.latitude, center.longitude], instance.getZoom());
    markerLayer.clearLayers();
    points.forEach((point) => {
      L.circleMarker([point.latitude, point.longitude], {
        radius: point.kind === "customer" ? 8 : 9,
        color: "#fff",
        weight: 3,
        fillColor: point.kind === "customer" ? "#337bd1" : "#276c55",
        fillOpacity: 1,
      })
        .bindTooltip(point.label)
        .addTo(markerLayer);
    });
    instance.invalidateSize();
  }, [center.latitude, center.longitude, points]);

  return (
    <div
      ref={container}
      className="pipego-live-map"
      aria-label="Map of plumbers and your location"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
