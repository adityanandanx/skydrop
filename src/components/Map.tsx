"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon issue in Leaflet when bundled with Next.js/Webpack
const setupLeafletMarker = () => {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};

interface MapProps {
  center?: [number, number];
  zoom?: number;
}

const Map: React.FC<MapProps> = ({ center = [51.505, -0.09], zoom = 13 }) => {
  useEffect(() => {
    setupLeafletMarker();
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={true}
      style={{ height: "100%", width: "100%" }}
      className="z-0 w-full h-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center}>
        <Popup>
          <div className="text-sm font-sans">
            <strong>Welcome to SkyDrop!</strong>
            <br />
            OpenStreetMap is ready.
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
};

export default Map;
