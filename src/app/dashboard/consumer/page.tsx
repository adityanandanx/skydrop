"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useUIStore } from "@/lib/store";
import { useRequests, useDrones, useUserProfile, useStations, useSuppliers, useDangerZones } from "@/lib/hooks";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Plane,
  CheckCircle,
  AlertTriangle,
  Home,
  Warehouse,
  Zap,
  Navigation,
  Box,
  PanelRightClose,
  PanelRight,
} from "lucide-react";

const MapDashboard = dynamic(() => import("@/components/MapDashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full min-h-[400px] bg-zinc-100 dark:bg-zinc-900 rounded-2xl animate-pulse">
      <p className="text-zinc-500 font-medium">Loading Interactive Map...</p>
    </div>
  ),
});

function formatETA(minutes: number): string {
  if (minutes <= 0.5) return "Landed";
  const totalMins = Math.round(minutes);
  if (totalMins < 60) {
    return `${totalMins} min${totalMins !== 1 ? "s" : ""}`;
  }
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours < 24) {
    return mins > 0 
      ? `${hours} hr${hours !== 1 ? "s" : ""} ${mins} min${mins !== 1 ? "s" : ""}`
      : `${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `${days} day${days !== 1 ? "s" : ""} ${remainingHours} hr${remainingHours !== 1 ? "s" : ""}`
    : `${days} day${days !== 1 ? "s" : ""}`;
}

export default function ConsumerDashboard() {
  const currentUser = auth?.currentUser;
  const { data: userProfile } = useUserProfile(currentUser?.uid);

  const consumerLandingZone = useUIStore((state) => state.consumerLandingZone);
  const setConsumerLandingZone = useUIStore((state) => state.setConsumerLandingZone);
  const isCustomLandingZone = useUIStore((state) => state.isCustomLandingZone);
  const setIsCustomLandingZone = useUIStore((state) => state.setIsCustomLandingZone);

  // Catalog state
  const [medicalQty, setMedicalQty] = useState(0);
  const [rationsQty, setRationsQty] = useState(0);
  const [waterQty, setWaterQty] = useState(0);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: requests = [] } = useRequests();
  const { data: drones = [] } = useDrones();
  const { data: stations = [] } = useStations();
  const { data: suppliers = [] } = useSuppliers();
  const { data: dangerZones = [] } = useDangerZones();

  const selectedEntity = useUIStore((state) => state.selectedEntity);
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity);

  const [rightOpen, setRightOpen] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setRightOpen(!isMobile);
  }, [isMobile]);

  const selectedStation = selectedEntity?.type === "station" ? stations.find(s => s.id === selectedEntity.id) : null;
  const selectedSupplier = selectedEntity?.type === "supplier" ? suppliers.find(s => s.id === selectedEntity.id) : null;
  const selectedDrone = selectedEntity?.type === "drone" ? drones.find(d => d.id === selectedEntity.id) : null;
  const selectedRequest = selectedEntity?.type === "request" ? requests.find(r => r.id === selectedEntity.id) : null;
  const selectedZone = selectedEntity?.type === "danger_zone" ? dangerZones.find(z => z.id === selectedEntity.id) : null;

  // Find user's active (not delivered) request
  const activeRequest = requests.find(
    (req) => req.consumerId === currentUser?.uid && req.status !== "delivered"
  );

  // Find drone carrying out the request
  const assignedDrone = activeRequest?.droneId
    ? drones.find((d) => d.id === activeRequest.droneId)
    : null;

  // 1. Geolocation Setup
  useEffect(() => {
    // Default Pune Coordinates
    const defaultCoords: [number, number] = [18.5204, 73.8567];

    if (!isCustomLandingZone && !consumerLandingZone) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (position.coords.latitude && position.coords.longitude) {
              setConsumerLandingZone([position.coords.latitude, position.coords.longitude]);
            } else {
              setConsumerLandingZone(defaultCoords);
            }
          },
          (error) => {
            console.warn("Geolocation permission denied or error, using default Pune location.", error);
            setConsumerLandingZone(defaultCoords);
          }
        );
      } else {
        setConsumerLandingZone(defaultCoords);
      }
    }
  }, [consumerLandingZone, isCustomLandingZone, setConsumerLandingZone]);



  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !currentUser || !consumerLandingZone) return;

    if (medicalQty === 0 && rationsQty === 0 && waterQty === 0) {
      setErrorMsg("Please select at least one item to request.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await addDoc(collection(db, "requests"), {
        consumerId: currentUser.uid,
        consumerName: userProfile?.name || "Emergency Survivor",
        lat: consumerLandingZone[0],
        lng: consumerLandingZone[1],
        items: {
          ...(medicalQty > 0 && { medical: medicalQty }),
          ...(rationsQty > 0 && { rations: rationsQty }),
          ...(waterQty > 0 && { water: waterQty }),
        },
        status: "pending",
        droneId: null,
        supplierId: null,
        createdAt: serverTimestamp(),
      });

      setSuccessMsg("Emergency request filed successfully! Monitoring dispatch...");
      setMedicalQty(0);
      setRationsQty(0);
      setWaterQty(0);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to file request: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Distance & ETA calculation helpers
  let distanceKm = 0;
  let etaMinutes = 0;
  if (assignedDrone && activeRequest) {
    const latDiff = assignedDrone.lat - activeRequest.lat;
    const lngDiff = assignedDrone.lng - activeRequest.lng;
    const degDist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    // 1 degree approx = 111 km
    distanceKm = degDist * 111;
    // Assume drone speed is ~40 km/h (approx 0.66 km per minute)
    etaMinutes = distanceKm / 0.66;
  }

  return (
    <SidebarProvider 
      className="w-full flex-1 overflow-hidden flex bg-zinc-50 dark:bg-zinc-950"
      style={{ minHeight: "0px", height: "100%", "--sidebar-width": "20rem" } as React.CSSProperties}
    >
      {/* 1. LEFT SIDEBAR: Controls & Inputs */}
      <Sidebar 
        side="left" 
        collapsible="offcanvas" 
        className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 flex flex-col h-full z-10"
      >
        <SidebarHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">Survivor Console</span>
          </div>
          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
        </SidebarHeader>

        <SidebarContent className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          {/* Active Request Monitor */}
          {activeRequest ? (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-550">
                  Active Supply Mission
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20 capitalize animate-pulse">
                  {activeRequest.status}
                </span>
              </div>

              <div className="space-y-4">
                {/* Timeline Progress */}
                <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 pl-4 ml-2 space-y-4">
                  <div className="relative">
                    <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 bg-indigo-500"></div>
                    <p className="text-[10px] font-semibold text-zinc-400">Step 1</p>
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Request Logged</p>
                  </div>
                  
                  <div className="relative">
                    <div className={`absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                      activeRequest.status !== "pending" ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}></div>
                    <p className="text-[10px] font-semibold text-zinc-400">Step 2</p>
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Drone Dispatched</p>
                  </div>

                  <div className="relative">
                    <div className={`absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                      activeRequest.status === "loaded" ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}></div>
                    <p className="text-[10px] font-semibold text-zinc-400">Step 3</p>
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">Cargo Packed & Flying</p>
                  </div>
                </div>

                {/* Drone details if assigned */}
                {assignedDrone ? (
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">Carrier:</span>
                      <span className="font-semibold">{assignedDrone.name}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">Battery Level:</span>
                      <span className="font-semibold">{assignedDrone.battery.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">Distance:</span>
                      <span className="font-semibold">{distanceKm.toFixed(2)} km</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">Arrival:</span>
                      <span className="font-semibold text-indigo-500">{formatETA(etaMinutes)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Waiting for dispatcher to allocate and route a drone from a launch station.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Request Creation Panel */
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-550">
                  Request Emergency Help
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Verify your coordinates on the map and choose supply quantities.
                </p>
              </div>

              <form onSubmit={handleRequestSubmit} className="space-y-4">
                {successMsg && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 p-2.5 rounded-lg text-[11px] font-semibold">
                    {successMsg}
                  </div>
                )}
                {errorMsg && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 p-2.5 rounded-lg text-[11px] font-semibold">
                    {errorMsg}
                  </div>
                )}

                {/* Product catalog counter controls */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700">
                    <div className="text-left">
                      <h3 className="text-xs font-bold">🩹 Medical Kit</h3>
                      <p className="text-[9px] text-zinc-500">First-aid, bandages</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setMedicalQty(Math.max(0, medicalQty - 1))} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">-</button>
                      <span className="w-5 text-center text-xs font-bold">{medicalQty}</span>
                      <button type="button" onClick={() => setMedicalQty(medicalQty + 1)} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700">
                    <div className="text-left">
                      <h3 className="text-xs font-bold">🥖 Food Rations</h3>
                      <p className="text-[9px] text-zinc-500">High-calorie packs</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setRationsQty(Math.max(0, rationsQty - 1))} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">-</button>
                      <span className="w-5 text-center text-xs font-bold">{rationsQty}</span>
                      <button type="button" onClick={() => setRationsQty(rationsQty + 1)} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">+</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700">
                    <div className="text-left">
                      <h3 className="text-xs font-bold">💧 Clean Water</h3>
                      <p className="text-[9px] text-zinc-500">Liter bottle packs</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setWaterQty(Math.max(0, waterQty - 1))} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">-</button>
                      <span className="w-5 text-center text-xs font-bold">{waterQty}</span>
                      <button type="button" onClick={() => setWaterQty(waterQty + 1)} className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-bold hover:bg-zinc-300 dark:hover:bg-zinc-650 flex items-center justify-center">+</button>
                    </div>
                  </div>
                </div>

                {/* Coordinates info */}
                <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-[11px] space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-indigo-500 font-semibold uppercase text-[9px] tracking-wider block">Landing Site</span>
                  </div>
                  {consumerLandingZone ? (
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Lat: {consumerLandingZone[0].toFixed(5)}, Lng: {consumerLandingZone[1].toFixed(5)}
                      <span className="block font-normal text-[9px] text-zinc-500 mt-0.5">
                        {isCustomLandingZone ? "✓ Target Drop Site Positioned" : "⚡ Drag pin to reposition drop site"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-zinc-400 font-medium">Acquiring coordinates...</span>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading || !consumerLandingZone}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-lg shadow-md shadow-rose-600/10 transition-transform active:scale-95 duration-100 text-xs"
                >
                  {loading ? "Filing Request..." : "Request Supply Drop"}
                </Button>
              </form>
            </div>
          )}
        </SidebarContent>
      </Sidebar>

      {/* 2. CENTER PANEL: Map Workspace */}
      <main className="flex-1 h-full min-h-0 relative flex flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {/* Sidebar Toggle Controls */}
        <div className="absolute top-3 left-3 z-40">
          <SidebarTrigger className="h-8 w-8 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 shadow-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300" />
        </div>
        <div className="absolute top-3 right-3 z-40">
          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="h-8 w-8 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 shadow-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center cursor-pointer transition-all hover:scale-105 active:scale-95"
            title="Toggle Inspector Panel"
          >
            {rightOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex-1 relative w-full h-full overflow-hidden">
          <MapDashboard mode="consumer" />
        </div>
      </main>

      {/* 3. RIGHT SIDEBAR: Selected Asset Inspector */}
      <div 
        className={`border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 flex flex-col h-full z-10 transition-all duration-300 ease-in-out overflow-hidden ${
          rightOpen ? 'w-80' : 'w-0'
        }`}
      >
        <div className="w-80 min-w-80 h-full flex flex-col">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">Asset Inspector</span>
          </div>
          {selectedEntity && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
              {selectedEntity.type.replace("_", " ")}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
          
          {/* No asset selected fallback */}
          {!selectedEntity && (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl py-12">
              <Box className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-3" />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">No Active Selection</span>
              <p className="text-[10px] text-zinc-400 max-w-xs mx-auto px-2 mt-1 leading-relaxed">
                Click any Drone, Launchpad, Warehouse, Request pin, or Hazard zone directly on the map to inspect live specs here.
              </p>
            </div>
          )}

          {/* 1. Selected Station / Launchpad Details */}
          {selectedEntity?.type === "station" && selectedStation && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Station Spec</div>
                <div><strong>Name:</strong> {selectedStation.name}</div>
                <div><strong>Coords:</strong> {selectedStation.lat.toFixed(5)}, {selectedStation.lng.toFixed(5)}</div>
              </div>

              <div>
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-1.5">
                  <Plane className="w-3.5 h-3.5 text-zinc-500" />
                  Docked Idle Drones ({drones.filter(d => d.stationId === selectedStation.id && d.status === "idle").length})
                </h4>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {drones
                    .filter(d => d.stationId === selectedStation.id && d.status === "idle")
                    .map(d => (
                      <div key={d.id} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-205">{d.name}</span>
                        <span className="font-bold text-emerald-500">{d.battery.toFixed(0)}%</span>
                      </div>
                    ))}
                  {drones.filter(d => d.stationId === selectedStation.id && d.status === "idle").length === 0 && (
                    <span className="text-[10px] text-zinc-400 block italic py-2">No idle drones docked here.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Selected Supplier / Warehouse Details */}
          {selectedEntity?.type === "supplier" && selectedSupplier && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Warehouse Spec</div>
                <div><strong>Name:</strong> {selectedSupplier.name}</div>
                <div><strong>Coords:</strong> {selectedSupplier.lat.toFixed(5)}, {selectedSupplier.lng.toFixed(5)}</div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Inventory Supply Levels</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="p-2 bg-rose-500/5 rounded-xl border border-rose-500/10 text-center flex flex-col justify-between items-center gap-1">
                    <span className="text-[8px] uppercase font-bold text-rose-500 leading-none">Medical</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.medical ?? 0}</span>
                  </div>
                  <div className="p-2 bg-amber-500/5 rounded-xl border border-amber-500/10 text-center flex flex-col justify-between items-center gap-1">
                    <span className="text-[8px] uppercase font-bold text-amber-500 leading-none">Rations</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.rations ?? 0}</span>
                  </div>
                  <div className="p-2 bg-blue-500/5 rounded-xl border border-blue-500/10 text-center flex flex-col justify-between items-center gap-1">
                    <span className="text-[8px] uppercase font-bold text-blue-500 leading-none">Water</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.water ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Selected Drone Details */}
          {selectedEntity?.type === "drone" && selectedDrone && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Drone Specifications</div>
                <div><strong>Name:</strong> {selectedDrone.name}</div>
                <div className="flex items-center gap-1.5">
                  <strong>Status:</strong>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    selectedDrone.status === "idle"
                      ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  }`}>
                    {selectedDrone.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span>Battery Capacity:</span>
                    <span>{selectedDrone.battery.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${
                        selectedDrone.battery > 50 
                          ? "bg-emerald-500" 
                          : selectedDrone.battery > 25 
                            ? "bg-amber-500" 
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${selectedDrone.battery}%` }}
                    ></div>
                  </div>
                </div>

                <div><strong>Coords:</strong> {selectedDrone.lat.toFixed(5)}, {selectedDrone.lng.toFixed(5)}</div>
              </div>

              {selectedDrone.currentMissionId && (
                <div className="p-3.5 bg-indigo-50/20 dark:bg-indigo-950/10 rounded-xl border border-indigo-100/40 dark:border-indigo-900/20 space-y-1.5">
                  <div className="font-bold text-[10px] uppercase text-indigo-600 tracking-wider flex items-center gap-1">
                    <Navigation className="w-3.5 h-3.5" />
                    Mission Telemetry
                  </div>
                  <div><strong>Request ID:</strong> {selectedDrone.currentMissionId.substring(0, 8)}</div>
                  {requests.find(r => r.id === selectedDrone.currentMissionId) && (
                    <>
                      <div><strong>Survivor Name:</strong> {requests.find(r => r.id === selectedDrone.currentMissionId)?.consumerName}</div>
                      <div><strong>Destination:</strong> {requests.find(r => r.id === selectedDrone.currentMissionId)?.lat.toFixed(4)}, {requests.find(r => r.id === selectedDrone.currentMissionId)?.lng.toFixed(4)}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. Selected Request Details */}
          {selectedEntity?.type === "request" && selectedRequest && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Request details</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    selectedRequest.status === "pending"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : selectedRequest.status === "delivered"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
                  }`}>
                    {selectedRequest.status}
                  </span>
                </div>
                <div><strong>Survivor:</strong> {selectedRequest.consumerName}</div>
                <div><strong>Drop Location:</strong> {selectedRequest.lat.toFixed(5)}, {selectedRequest.lng.toFixed(5)}</div>
                
                <div className="p-2 bg-white dark:bg-zinc-900 rounded border border-zinc-150 dark:border-zinc-800 text-[11px] space-y-1">
                  <span className="font-bold text-[9px] uppercase tracking-wider text-zinc-400 block mb-0.5">Cargo Manifest</span>
                  {Object.entries(selectedRequest.items).map(([k, v]) => (
                    <div key={k} className="capitalize flex justify-between">
                      <span>{k}:</span>
                      <strong>{v} units</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. Selected Danger Zone Details */}
          {selectedEntity?.type === "danger_zone" && selectedZone && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">Hazard Specifications</div>
                <div><strong>Center Coords:</strong> {selectedZone.centerLat.toFixed(5)}, {selectedZone.centerLng.toFixed(5)}</div>
                <div><strong>Severity:</strong> <span className="font-bold text-rose-500 capitalize">{selectedZone.severity}</span></div>
                <div><strong>Radius:</strong> {selectedZone.radius} meters</div>
              </div>
            </div>
          )}

        </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
