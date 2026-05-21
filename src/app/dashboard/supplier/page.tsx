"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSuppliers, useDrones, useRequests, useStations, useDangerZones } from "@/lib/hooks";
import { useUIStore } from "@/lib/store";
import { db } from "@/lib/firebase";
import { doc, updateDoc, writeBatch } from "firebase/firestore";
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
  Package,
  Plane,
  AlertTriangle,
  Home,
  Warehouse,
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

export default function SupplierDashboard() {
  const { data: suppliers = [] } = useSuppliers();
  const { data: drones = [] } = useDrones();
  const { data: requests = [] } = useRequests();
  const { data: stations = [] } = useStations();
  const { data: dangerZones = [] } = useDangerZones();

  // Selected Entity details from global UI store
  const selectedEntity = useUIStore((state) => state.selectedEntity);
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity);

  const selectedStation = selectedEntity?.type === "station" ? stations.find(s => s.id === selectedEntity.id) : null;
  const selectedSupplier = selectedEntity?.type === "supplier" ? suppliers.find(s => s.id === selectedEntity.id) : null;
  const selectedDrone = selectedEntity?.type === "drone" ? drones.find(d => d.id === selectedEntity.id) : null;
  const selectedRequest = selectedEntity?.type === "request" ? requests.find(r => r.id === selectedEntity.id) : null;
  const selectedZone = selectedEntity?.type === "danger_zone" ? dangerZones.find(z => z.id === selectedEntity.id) : null;

  // Active warehouse selection defaults to the map selection, falls back to the first warehouse
  const activeWarehouse = selectedSupplier || suppliers[0];

  // Loading states
  const [loading, setLoading] = useState<string | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setRightOpen(!isMobile);
  }, [isMobile]);

  // Inventory adjustment states
  const [medicalIn, setMedicalIn] = useState(0);
  const [rationsIn, setRationsIn] = useState(0);
  const [waterIn, setWaterIn] = useState(0);

  const handleUpdateInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !activeWarehouse) return;

    const warehouseRef = doc(db, "suppliers", activeWarehouse.id);
    const updatedInventory = {
      medical: Math.max(0, (activeWarehouse.inventory?.medical ?? 0) + medicalIn),
      rations: Math.max(0, (activeWarehouse.inventory?.rations ?? 0) + rationsIn),
      water: Math.max(0, (activeWarehouse.inventory?.water ?? 0) + waterIn),
    };

    try {
      await updateDoc(warehouseRef, { inventory: updatedInventory });
      setMedicalIn(0);
      setRationsIn(0);
      setWaterIn(0);
    } catch (err) {
      console.error("Failed to update inventory:", err);
    }
  };

  // Find requests matching the selected warehouse (supplierId) where drone is waiting to load
  const landingMissions = selectedSupplier
    ? requests
        .filter((req) => req.supplierId === selectedSupplier.id && req.status === "dispatched")
        .map((req) => {
          const drone = drones.find((d) => d.id === req.droneId && d.status === "waiting_for_load");
          return { request: req, drone };
        })
        .filter((item) => item.drone !== undefined)
    : [];

  const handleLoadCargo = async (requestId: string, droneId: string, items: { [key: string]: number }) => {
    if (!db || !selectedSupplier) return;
    setLoading(requestId);

    const batch = writeBatch(db);

    // 1. Deduct items from Supplier Inventory
    const warehouseRef = doc(db, "suppliers", selectedSupplier.id);
    const updatedInventory = {
      medical: Math.max(0, (selectedSupplier.inventory?.medical ?? 0) - (items.medical ?? 0)),
      rations: Math.max(0, (selectedSupplier.inventory?.rations ?? 0) - (items.rations ?? 0)),
      water: Math.max(0, (selectedSupplier.inventory?.water ?? 0) - (items.water ?? 0)),
    };
    batch.update(warehouseRef, { inventory: updatedInventory });

    // 2. Set Request Status to "loaded"
    const requestRef = doc(db, "requests", requestId);
    batch.update(requestRef, { status: "loaded" });

    // 3. Set Drone Status to "carrying_cargo" (so it departs)
    const droneRef = doc(db, "drones", droneId);
    batch.update(droneRef, { status: "carrying_cargo" });

    try {
      await batch.commit();
    } catch (err) {
      console.error("Failed to pack & load drone cargo:", err);
    } finally {
      setLoading(null);
    }
  };

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
            <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">Warehouse Terminal</span>
          </div>
          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        </SidebarHeader>

        <SidebarContent className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          
          {/* Inventory Registry */}
          {activeWarehouse ? (
            <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm space-y-4">
              <div className="space-y-0.5">
                <h2 className="text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Inventory Registry
                </h2>
                <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                  {selectedSupplier 
                    ? `Managing: ${activeWarehouse.name}` 
                    : `Default: ${activeWarehouse.name} (Select on map)`}
                </p>
              </div>

              {/* Current levels */}
              <div className="grid grid-cols-3 gap-2 text-center font-medium">
                <div className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/10">
                  <span className="text-[8px] text-rose-500 font-semibold block uppercase">Medical</span>
                  <span className="text-sm font-bold text-zinc-850 dark:text-zinc-100">{activeWarehouse.inventory?.medical ?? 0}</span>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                  <span className="text-[8px] text-amber-500 font-semibold block uppercase">Rations</span>
                  <span className="text-sm font-bold text-zinc-850 dark:text-zinc-100">{activeWarehouse.inventory?.rations ?? 0}</span>
                </div>
                <div className="p-2 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <span className="text-[8px] text-blue-500 font-semibold block uppercase">Water</span>
                  <span className="text-sm font-bold text-zinc-850 dark:text-zinc-100">{activeWarehouse.inventory?.water ?? 0}</span>
                </div>
              </div>

              {/* Stock restock form */}
              <form onSubmit={handleUpdateInventory} className="space-y-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 block">Restock Supplies</span>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      type="number"
                      placeholder="+/-"
                      value={medicalIn || ""}
                      onChange={(e) => setMedicalIn(parseInt(e.target.value) || 0)}
                      className="w-full text-center py-1 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs dark:bg-zinc-800"
                    />
                    <span className="text-[8px] text-zinc-400 block mt-0.5 text-center">Medical</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="+/-"
                      value={rationsIn || ""}
                      onChange={(e) => setRationsIn(parseInt(e.target.value) || 0)}
                      className="w-full text-center py-1 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs dark:bg-zinc-800"
                    />
                    <span className="text-[8px] text-zinc-400 block mt-0.5 text-center">Rations</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="+/-"
                      value={waterIn || ""}
                      onChange={(e) => setWaterIn(parseInt(e.target.value) || 0)}
                      className="w-full text-center py-1 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs dark:bg-zinc-800"
                    />
                    <span className="text-[8px] text-zinc-400 block mt-0.5 text-center">Water</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-1.5 rounded-lg"
                >
                  Apply Inventory Changes
                </Button>
              </form>
            </div>
          ) : (
            <div className="p-4 text-center text-zinc-405 text-xs">
              No warehouses found. Please create one in Admin view.
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
          <MapDashboard mode="supplier" />
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
                          <span className="font-semibold text-zinc-700 dark:text-zinc-200">{d.name}</span>
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

            {/* 2. Selected Supplier / Warehouse Details with Drone Loading Queue */}
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

                {/* Cargo Loading Dock */}
                <div className="space-y-3 pt-2">
                  <div>
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                      Loading Dock Queue
                    </h4>
                    <p className="text-[9px] text-zinc-500 dark:text-zinc-400">
                      Drones parked waiting for supplier load approval.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {landingMissions.map(({ request, drone }) => {
                      if (!drone) return null;
                      return (
                        <div key={request.id} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800 space-y-2">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="font-bold text-indigo-600">{drone.name}</span>
                            <span className="text-[9px] text-zinc-400">Req: {request.id.substring(0, 6)}</span>
                          </div>
                          
                          <div className="text-[11px] space-y-1 bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-100 dark:border-zinc-800">
                            <span className="font-semibold text-zinc-500 block text-[9px] uppercase">Supplies Requested:</span>
                            {Object.entries(request.items).map(([item, qty]) => (
                              <div key={item} className="capitalize flex justify-between">
                                <span>{item}:</span>
                                <strong>{qty} units</strong>
                              </div>
                            ))}
                          </div>

                          <Button
                            onClick={() => handleLoadCargo(request.id, drone.id, request.items)}
                            disabled={loading === request.id}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold py-1.5 rounded-lg transition-transform active:scale-95 duration-100 shadow-md shadow-emerald-600/10 animate-in fade-in duration-100"
                          >
                            {loading === request.id ? "Packing..." : "Mark Packed & Loaded"}
                          </Button>
                        </div>
                      );
                    })}

                    {landingMissions.length === 0 && (
                      <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <Package className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                        <span className="text-[10px] font-medium">No drones in loading dock</span>
                      </div>
                    )}
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
