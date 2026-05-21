"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, Tooltip, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useUIStore } from "@/lib/store";
import { renderToString } from "react-dom/server";
import { Plane, Home, Warehouse, AlertTriangle, MapPin, ChevronDown, Locate } from "lucide-react";
import { 
  useDrones, 
  useStations, 
  useSuppliers, 
  useRequests, 
  useDangerZones,
  Drone,
  Station,
  Supplier,
  DeliveryRequest,
  DangerZone
} from "@/lib/hooks";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore";

// Fix default leaflet icons
const fixLeafletIcons = () => {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
};

// Premium Custom DivIcon creators styled with Tailwind
const createDroneIcon = (drone: Drone, isSelected: boolean = false) => {
  const isFlying = drone.status !== "idle" && drone.status !== "waiting_for_load";
  const batteryColor = drone.battery > 50 ? "bg-emerald-500" : drone.battery > 25 ? "bg-amber-500" : "bg-rose-500";
  const iconHtml = renderToString(
    <Plane className={`w-4 h-4 ${isFlying ? "animate-spin" : ""}`} />
  );
  
  return L.divIcon({
    className: "custom-drone-icon",
    html: `
      <div class="relative flex items-center justify-center transition-all duration-300 ${isSelected ? "scale-135 z-[9999]" : "hover:scale-115"}">
        <!-- Active selection glow ring -->
        ${isSelected ? `<span class="absolute inline-flex h-12 w-12 rounded-full bg-indigo-500 opacity-40 animate-pulse"></span>` : ""}
        
        <!-- Ping ripple effect if flying -->
        ${isFlying ? `<span class="absolute inline-flex h-10 w-10 rounded-full bg-indigo-400 opacity-75 animate-ping"></span>` : ""}
        
        <!-- Drone body -->
        <div class="relative w-8 h-8 rounded-full ${isSelected ? "bg-indigo-700 border-2 border-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.6)]" : "bg-indigo-600 border-2 border-white shadow-md"} flex items-center justify-center text-white">
          ${iconHtml}
          
          <!-- Battery indicator bar -->
          <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-white">
            <div class="h-full ${batteryColor}" style="width: ${drone.battery}%"></div>
          </div>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

const createStationIcon = (station: Station, droneCount: number = 0, isSelected: boolean = false) => {
  const badgeHtml = droneCount > 0
    ? `<span class="absolute -top-1.5 -right-1.5 bg-indigo-600 border border-white text-white rounded-full text-[8px] font-black w-5 h-5 flex items-center justify-center shadow-sm">${droneCount}</span>`
    : '';
  const iconHtml = renderToString(
    <Home className="w-4 h-4" />
  );
  return L.divIcon({
    className: "custom-station-icon",
    html: `
      <div class="relative flex items-center justify-center transition-all duration-300 ${isSelected ? "scale-135 z-[9999]" : "hover:scale-115"}">
        <!-- Active selection glow ring -->
        ${isSelected ? `<span class="absolute inline-flex h-11 w-11 rounded-full bg-blue-500 opacity-40 animate-pulse"></span>` : ""}
        <div class="relative w-7 h-7 rounded-lg ${isSelected ? "bg-blue-700 border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.6)]" : "bg-blue-600 border-2 border-white shadow-md"} flex items-center justify-center text-white hover:bg-blue-700 transition-colors">
          ${iconHtml}
          ${badgeHtml}
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const createSupplierIcon = (supplier: Supplier, droneCount: number = 0, isSelected: boolean = false) => {
  const badgeHtml = droneCount > 0
    ? `<span class="absolute -top-1.5 -right-1.5 bg-indigo-600 border border-white text-white rounded-full text-[8px] font-black w-5 h-5 flex items-center justify-center shadow-sm">${droneCount}</span>`
    : '';
  const iconHtml = renderToString(
    <Warehouse className="w-4 h-4" />
  );
  return L.divIcon({
    className: "custom-supplier-icon",
    html: `
      <div class="relative flex items-center justify-center transition-all duration-300 ${isSelected ? "scale-135 z-[9999]" : "hover:scale-115"}">
        <!-- Active selection glow ring -->
        ${isSelected ? `<span class="absolute inline-flex h-11 w-11 rounded-full bg-amber-500 opacity-40 animate-pulse"></span>` : ""}
        <div class="relative w-7 h-7 rounded-lg ${isSelected ? "bg-amber-600 border-2 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.6)]" : "bg-amber-500 border-2 border-white shadow-md"} flex items-center justify-center text-white hover:bg-amber-600 transition-colors">
          ${iconHtml}
          ${badgeHtml}
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const createRequestIcon = (request: DeliveryRequest, isSelected: boolean = false) => {
  const statusColor = request.status === "pending" ? "bg-rose-500" : request.status === "dispatched" ? "bg-cyan-500" : "bg-emerald-500";
  const statusBorderColor = request.status === "pending" ? "border-rose-300" : request.status === "dispatched" ? "border-cyan-300" : "border-emerald-300";
  const glowColor = request.status === "pending" ? "rgba(244,63,94,0.6)" : request.status === "dispatched" ? "rgba(6,182,212,0.6)" : "rgba(16,185,129,0.6)";
  const iconHtml = renderToString(
    <AlertTriangle className="w-4 h-4" />
  );
  return L.divIcon({
    className: "custom-request-icon",
    html: `
      <div class="relative flex items-center justify-center transition-all duration-300 ${isSelected ? "scale-135 z-[9999]" : "hover:scale-115"}">
        <!-- Active selection glow ring -->
        ${isSelected ? `<span class="absolute inline-flex h-11 w-11 rounded-full ${statusColor} opacity-40 animate-pulse"></span>` : ""}
        <span class="absolute inline-flex h-9 w-9 rounded-full ${statusColor} opacity-40 animate-ping"></span>
        <div class="relative w-7 h-7 rounded-full ${isSelected ? `${statusColor} border-2 ${statusBorderColor} shadow-[0_0_15px_${glowColor}]` : `${statusColor} border-2 border-white shadow-md`} flex items-center justify-center text-white">
          ${iconHtml}
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const createConsumerPinIcon = () => {
  const iconHtml = renderToString(
    <MapPin className="w-4 h-4" />
  );
  return L.divIcon({
    className: "custom-consumer-pin",
    html: `
      <div class="relative flex items-center justify-center">
        <span class="absolute w-8 h-8 rounded-full border-2 border-purple-500/50 animate-pulse bg-purple-500/10"></span>
        <div class="w-7 h-7 rounded-full bg-purple-600 border-2 border-white shadow-md flex items-center justify-center text-white">
          ${iconHtml}
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

const createBlueDotIcon = () => {
  return L.divIcon({
    className: "gps-blue-dot",
    html: `
      <div class="relative flex items-center justify-center">
        <!-- Outer semi-transparent pulse outline -->
        <span class="absolute inline-flex h-6 w-6 rounded-full bg-blue-500 opacity-40 animate-ping"></span>
        <!-- Inner blue dot -->
        <div class="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Helper component to force Leaflet resize on mount & layout adjustments
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timers = [
      setTimeout(() => map.invalidateSize(), 50),
      setTimeout(() => map.invalidateSize(), 200),
      setTimeout(() => map.invalidateSize(), 500),
    ];
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [map]);
  return null;
}

interface MapDashboardProps {
  mode: "admin" | "supplier" | "consumer";
}

export default function MapDashboard({ mode }: MapDashboardProps) {
  useEffect(() => {
    fixLeafletIcons();
  }, []);

  const activeTool = useUIStore((state) => state.activeTool);
  const setActiveTool = useUIStore((state) => state.setActiveTool);
  
  const dangerZoneSeverity = useUIStore((state) => state.dangerZoneSeverity);
  const dangerZoneRadius = useUIStore((state) => state.dangerZoneRadius);

  const consumerLandingZone = useUIStore((state) => state.consumerLandingZone);
  const setConsumerLandingZone = useUIStore((state) => state.setConsumerLandingZone);
  const setIsCustomLandingZone = useUIStore((state) => state.setIsCustomLandingZone);
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity);
  const selectedEntity = useUIStore((state) => state.selectedEntity);
  const [isLegendExpanded, setIsLegendExpanded] = React.useState(false);
  const theme = useUIStore((state) => state.theme);
  const previewRoute = useUIStore((state) => state.previewRoute);

  const [gpsCurrentLocation, setGpsCurrentLocation] = useState<[number, number] | null>(null);

  // Geolocation Setup for Live GPS Location
  useEffect(() => {
    if (mode === "consumer") {
      const defaultCoords: [number, number] = [18.5204, 73.8567];
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (position.coords.latitude && position.coords.longitude) {
              setGpsCurrentLocation([position.coords.latitude, position.coords.longitude]);
            } else {
              setGpsCurrentLocation(defaultCoords);
            }
          },
          (error) => {
            console.warn("Geolocation permission error", error);
            setGpsCurrentLocation(defaultCoords);
          }
        );
      } else {
        setGpsCurrentLocation(defaultCoords);
      }
    }
  }, [mode]);

  const handleResetToCurrentLocation = () => {
    const defaultCoords: [number, number] = [18.5204, 73.8567];
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (position.coords.latitude && position.coords.longitude) {
            const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
            setGpsCurrentLocation(coords);
            setConsumerLandingZone(coords);
            setIsCustomLandingZone(false);
          } else {
            setConsumerLandingZone(defaultCoords);
            setIsCustomLandingZone(false);
          }
        },
        (error) => {
          console.warn("Geolocation error", error);
          setConsumerLandingZone(defaultCoords);
          setIsCustomLandingZone(false);
        }
      );
    } else {
      setConsumerLandingZone(defaultCoords);
      setIsCustomLandingZone(false);
    }
  };

  // Sync data dynamically from React Query
  const { data: drones = [] } = useDrones();
  const { data: stations = [] } = useStations();
  const { data: suppliers = [] } = useSuppliers();
  const { data: requests = [] } = useRequests();
  const { data: dangerZones = [] } = useDangerZones();

  // Pune Center
  const mapCenter: [number, number] = [18.5204, 73.8567];

  // Delete document handler
  const handleDelete = async (collectionName: string, id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      console.error(`Failed to delete ${collectionName} document:`, error);
    }
  };

  // Helper to handle Map Clicks (Drawing Tools & Pin Drops)
  const MapClickHandler = () => {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;

        if (mode === "admin" && activeTool !== "none") {
          try {
            if (activeTool === "add_station") {
              await addDoc(collection(db!, "stations"), {
                name: `Drone Dock - ${stations.length + 1}`,
                lat,
                lng,
                createdAt: serverTimestamp(),
              });
            } else if (activeTool === "add_supplier") {
              await addDoc(collection(db!, "suppliers"), {
                name: `Emergency Warehouse - ${suppliers.length + 1}`,
                lat,
                lng,
                inventory: {
                  medical: 20,
                  rations: 50,
                  water: 100,
                },
                createdAt: serverTimestamp(),
              });
            } else if (activeTool === "draw_danger_zone") {
              await addDoc(collection(db!, "danger_zones"), {
                centerLat: lat,
                centerLng: lng,
                radius: dangerZoneRadius,
                severity: dangerZoneSeverity,
                createdAt: serverTimestamp(),
              });
            }
          } catch (error) {
            console.error("Failed to add map element:", error);
          } finally {
            setActiveTool("none");
          }
        }

        // Consumer target drop zone can only be dragged, not clicked/placed on map
        else if (mode === "consumer") {
          // No-op to disable clicking on map for drop location placement
        }
      },
    });
    return null;
  };

  return (
    <div className="w-full h-full min-h-[400px] md:min-h-[550px] relative flex flex-col rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <MapContainer
        center={mapCenter}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        className="flex-1 w-full z-0"
      >
        <MapResizer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={theme === "dark" 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
        />

        <MapClickHandler />

        {/* 1. Stations Overlay */}
        {stations.map((station) => {
          const stationDrones = drones.filter((d) => d.stationId === station.id && d.status === "idle");
          const isSelected = selectedEntity?.type === "station" && selectedEntity.id === station.id;
          return (
            <Marker 
              key={station.id} 
              position={[station.lat, station.lng]} 
              icon={createStationIcon(station, stationDrones.length, isSelected)}
              eventHandlers={{
                click: () => {
                  setSelectedEntity({ type: "station", id: station.id });
                }
              }}
            >
              <Tooltip permanent={false} direction="bottom" offset={[0, 15]} className="custom-map-tooltip">
                🏠 Launchpad: {station.name}
              </Tooltip>
            </Marker>
          );
        })}

        {/* 2. Suppliers Overlay */}
        {suppliers.map((supplier) => {
          const warehouseDrones = drones.filter((d) => {
            if (d.status !== "waiting_for_load" || !d.currentMissionId) return false;
            const req = requests.find((r) => r.id === d.currentMissionId);
            return req?.supplierId === supplier.id;
          });
          const isSelected = selectedEntity?.type === "supplier" && selectedEntity.id === supplier.id;
          return (
            <Marker 
              key={supplier.id} 
              position={[supplier.lat, supplier.lng]} 
              icon={createSupplierIcon(supplier, warehouseDrones.length, isSelected)}
              eventHandlers={{
                click: () => {
                  setSelectedEntity({ type: "supplier", id: supplier.id });
                }
              }}
            >
              <Tooltip permanent={false} direction="bottom" offset={[0, 15]} className="custom-map-tooltip">
                🏭 Warehouse: {supplier.name}
              </Tooltip>
            </Marker>
          );
        })}

        {/* 3. Requests Overlay (Only show active/pending requests) */}
        {requests
          .filter((req) => req.status !== "delivered")
          .map((req) => {
            const isSelected = selectedEntity?.type === "request" && selectedEntity.id === req.id;
            return (
              <Marker
                key={req.id}
                position={[req.lat, req.lng]}
                icon={createRequestIcon(req, isSelected)}
                eventHandlers={{
                  click: () => {
                    setSelectedEntity({ type: "request", id: req.id });
                  }
                }}
              >
                <Tooltip permanent={false} direction="bottom" offset={[0, 15]} className="custom-map-tooltip">
                  🆘 Request: {req.consumerName}
                </Tooltip>
              </Marker>
            );
          })}

        {/* 4. Drones Overlay & Flight Path Lines (Only show flying drones) */}
        {drones
          .filter((drone) => drone.status !== "idle" && drone.status !== "waiting_for_load")
          .map((drone) => {
            const dronePos: [number, number] = [drone.lat, drone.lng];
            const activeRequest = drone.currentMissionId 
              ? requests.find(r => r.id === drone.currentMissionId) 
              : null;
            const activeSupplier = activeRequest 
              ? suppliers.find(s => s.id === activeRequest.supplierId) 
              : null;
            const homeStation = stations.find(s => s.id === drone.stationId);

            let polylinePath: [number, number][] = [];

            if (drone.status === "flying_to_supplier" && activeSupplier) {
              polylinePath = [dronePos, [activeSupplier.lat, activeSupplier.lng]];
            } else if (drone.status === "carrying_cargo" && activeRequest) {
              polylinePath = [dronePos, [activeRequest.lat, activeRequest.lng]];
            } else if (drone.status === "returning" && homeStation) {
              polylinePath = [dronePos, [homeStation.lat, homeStation.lng]];
            }

            const isSelected = selectedEntity?.type === "drone" && selectedEntity.id === drone.id;

            return (
              <React.Fragment key={drone.id}>
                {/* Drone marker */}
                <Marker 
                  position={dronePos} 
                  icon={createDroneIcon(drone, isSelected)}
                  eventHandlers={{
                    click: () => {
                      setSelectedEntity({ type: "drone", id: drone.id });
                    }
                  }}
                >
                  <Tooltip permanent={false} direction="top" offset={[0, -15]} className="custom-map-tooltip">
                    🛸 Drone: {drone.name} ({drone.status === "flying_to_supplier" ? "to warehouse" : drone.status === "carrying_cargo" ? "carrying cargo" : "returning"})
                  </Tooltip>
                </Marker>

                {/* Drone flight path line */}
                {polylinePath.length > 0 && (
                  <Polyline 
                    positions={polylinePath} 
                    color="#6366f1" 
                    weight={2.5} 
                    dashArray="6, 6" 
                    opacity={0.8}
                  />
                )}
              </React.Fragment>
            );
          })}

        {/* 5. Danger Zones Overlay */}
        {dangerZones.map((zone) => {
          const colorMap = {
            low: "#eab308", // Yellow
            medium: "#f97316", // Orange
            high: "#ef4444", // Red
          };
          const color = colorMap[zone.severity] || "#ef4444";
          const isSelected = selectedEntity?.type === "danger_zone" && selectedEntity.id === zone.id;

          return (
            <Circle
              key={zone.id}
              center={[zone.centerLat, zone.centerLng]}
              radius={zone.radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: isSelected ? 0.35 : 0.15,
                color: color,
                weight: isSelected ? 4.5 : 1.5,
                dashArray: isSelected ? "8, 8" : undefined,
              }}
              eventHandlers={{
                click: () => {
                  setSelectedEntity({ type: "danger_zone", id: zone.id });
                }
              }}
            >
              <Tooltip permanent={false} direction="center" className="custom-map-tooltip">
                ⚠️ Hazard Zone ({zone.severity.toUpperCase()})
              </Tooltip>
            </Circle>
          );
        })}

        {/* GPS Current Location accuracy circle, blue dot, and dotted line to drop site */}
        {mode === "consumer" && gpsCurrentLocation && (
          <>
            {/* Accuracy circle */}
            <Circle
              center={gpsCurrentLocation}
              radius={40}
              pathOptions={{
                color: "#3b82f6",
                fillColor: "#3b82f6",
                fillOpacity: 0.1,
                weight: 1,
              }}
            />

            {/* Live GPS location blue dot */}
            <Marker
              position={gpsCurrentLocation}
              icon={createBlueDotIcon()}
              interactive={false}
            >
              <Tooltip permanent={false} direction="bottom" offset={[0, 10]} className="custom-map-tooltip">
                🔵 My Current GPS Location
              </Tooltip>
            </Marker>

            {/* Dotted line to target drop site */}
            {consumerLandingZone && (
              <Polyline
                positions={[gpsCurrentLocation, consumerLandingZone]}
                pathOptions={{
                  color: "#6366f1",
                  weight: 2,
                  dashArray: "4, 6",
                  opacity: 0.7,
                }}
              />
            )}
          </>
        )}

        {/* 6. Consumer Target Drop Site Marker */}
        {mode === "consumer" && consumerLandingZone && (
          <Marker
            position={consumerLandingZone}
            icon={createConsumerPinIcon()}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                if (marker) {
                  const position = marker.getLatLng();
                  setConsumerLandingZone([position.lat, position.lng]);
                  setIsCustomLandingZone(true);
                }
              },
            }}
          >
            <Tooltip permanent={true} direction="top" offset={[0, -15]} className="custom-map-tooltip">
              📍 My Drop Site (Draggable)
            </Tooltip>
          </Marker>
        )}

        {/* Route Preview Polylines */}
        {mode === "admin" && previewRoute && (
          <>
            {/* Leg 1: Drone to Warehouse (Amber) */}
            {previewRoute.dronePath && previewRoute.dronePath.length > 0 && (
              <Polyline
                positions={previewRoute.dronePath}
                pathOptions={{
                  color: "#f59e0b",
                  weight: 4,
                  dashArray: "6, 8",
                  opacity: 0.95
                }}
              >
                <Tooltip sticky permanent={false} className="custom-map-tooltip">
                  <span>⚡ Leg 1: Drone ➔ Warehouse (Pickup)</span>
                </Tooltip>
              </Polyline>
            )}

            {/* Leg 2: Warehouse to Consumer (Emerald) */}
            {previewRoute.deliveryPath && previewRoute.deliveryPath.length > 0 && (
              <Polyline
                positions={previewRoute.deliveryPath}
                pathOptions={{
                  color: "#10b981",
                  weight: 4,
                  dashArray: "6, 8",
                  opacity: 0.95
                }}
              >
                <Tooltip sticky permanent={false} className="custom-map-tooltip">
                  <span>⚡ Leg 2: Warehouse ➔ Survivor (Delivery)</span>
                </Tooltip>
              </Polyline>
            )}

            {/* Leg 3: Consumer to Drone Home Station (Zinc/Gray) */}
            {previewRoute.returnPath && previewRoute.returnPath.length > 0 && (
              <Polyline
                positions={previewRoute.returnPath}
                pathOptions={{
                  color: "#71717a",
                  weight: 3,
                  dashArray: "4, 6",
                  opacity: 0.75
                }}
              >
                <Tooltip sticky permanent={false} className="custom-map-tooltip">
                  <span>⚡ Leg 3: Survivor ➔ Launchpad (Return)</span>
                </Tooltip>
              </Polyline>
            )}
          </>
        )}
      </MapContainer>

      {/* Floating UI Hints */}
      {mode === "admin" && activeTool !== "none" && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-zinc-900 text-white text-xs px-4 py-2 rounded-full border border-zinc-700 shadow-lg font-medium flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span>Click map to place your new {activeTool.replace("add_", "").replace("draw_", "").replace("_", " ")}</span>
          <button 
            onClick={() => setActiveTool("none")} 
            className="ml-2 hover:text-zinc-300 font-bold bg-zinc-800 rounded px-1.5"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating Map Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-zinc-950/90 dark:bg-zinc-950/95 backdrop-blur-md border border-zinc-800 p-3 rounded-xl text-white shadow-lg text-[11px] w-48 pointer-events-auto select-none transition-all duration-200">
        <button 
          onClick={() => setIsLegendExpanded(!isLegendExpanded)}
          className="w-full font-bold text-zinc-300 flex items-center justify-between cursor-pointer hover:text-white transition-colors border-none bg-transparent p-0 text-left"
        >
          <div className="flex items-center gap-1.5">
            <span>🗺️</span>
            <span>Map Legend</span>
          </div>
          <ChevronDown 
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${isLegendExpanded ? "rotate-180" : ""}`}
          />
        </button>
        
        {isLegendExpanded && (
          <div className="space-y-2 mt-2 pt-2 border-t border-zinc-800 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-blue-600 border border-blue-500 flex items-center justify-center text-xs">🏠</span>
              <div>
                <span className="font-semibold block text-zinc-200">Drone Launchpad</span>
                <span className="text-[9px] text-zinc-400 block leading-none">Idle docks & chargers</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-amber-500 border border-amber-400 flex items-center justify-center text-xs">🏭</span>
              <div>
                <span className="font-semibold block text-zinc-200">Emergency Warehouse</span>
                <span className="text-[9px] text-zinc-400 block leading-none">Supplies stocked & loaded</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-rose-500 border border-rose-400 flex items-center justify-center text-xs">🆘</span>
              <div>
                <span className="font-semibold block text-zinc-200">Survivor Request</span>
                <span className="text-[9px] text-zinc-400 block leading-none">Active emergency need</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-indigo-600 border border-indigo-500 flex items-center justify-center text-xs">🛸</span>
              <div>
                <span className="font-semibold block text-zinc-200">Active Drone</span>
                <span className="text-[9px] text-zinc-400 block leading-none">In-flight delivery agent</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded bg-red-500/20 border border-red-500 flex items-center justify-center text-[10px]">⚠️</span>
              <div>
                <span className="font-semibold block text-zinc-200">Hazard/Danger Zone</span>
                <span className="text-[9px] text-zinc-400 block leading-none">Wind shear risk area</span>
              </div>
            </div>
            {mode === "consumer" && (
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-purple-600 border border-purple-500 flex items-center justify-center text-xs">📍</span>
                <div>
                  <span className="font-semibold block text-zinc-200">Target Drop Site</span>
                  <span className="text-[9px] text-zinc-400 block leading-none">Your safe landing zone</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating GPS Reset / Current Location Button (only in consumer mode) */}
      {mode === "consumer" && (
        <button
          onClick={handleResetToCurrentLocation}
          className="absolute bottom-4 right-4 z-[1000] w-10 h-10 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none"
          title="Recenter Drop Site to GPS Current Location"
        >
          <Locate className="w-5 h-5 text-zinc-650 dark:text-zinc-450" />
        </button>
      )}
    </div>
  );
}
