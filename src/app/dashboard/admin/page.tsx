"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useDrones, useStations, useSuppliers, useRequests, useDangerZones } from "@/lib/hooks";
import { useUIStore, MapTool, DangerZoneSeverity } from "@/lib/store";
import { db } from "@/lib/firebase";
import { doc, collection, addDoc, writeBatch, serverTimestamp, deleteDoc, updateDoc } from "firebase/firestore";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Plane,
  CheckCircle,
  Battery,
  AlertTriangle,
  Home,
  Warehouse,
  Zap,
  Trash2,
  Navigation,
  Package,
  X,
  MapPin,
  Box,
  PackageOpen,
  Ban,
  AlertOctagon,
  CircleDot,
  Compass,
  Clock,
  BatteryCharging,
  ShieldAlert,
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

export default function AdminDashboard() {
  const { data: drones = [] } = useDrones();
  const { data: stations = [] } = useStations();
  const { data: suppliers = [] } = useSuppliers();
  const { data: requests = [] } = useRequests();
  const { data: dangerZones = [] } = useDangerZones();

  // Zustand state triggers
  const activeTool = useUIStore((state) => state.activeTool);
  const setActiveTool = useUIStore((state) => state.setActiveTool);
  const dangerZoneSeverity = useUIStore((state) => state.dangerZoneSeverity);
  const setDangerZoneSeverity = useUIStore((state) => state.setDangerZoneSeverity);
  const dangerZoneRadius = useUIStore((state) => state.dangerZoneRadius);
  const setDangerZoneRadius = useUIStore((state) => state.setDangerZoneRadius);
  const selectedEntity = useUIStore((state) => state.selectedEntity);
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity);
  const previewRoute = useUIStore((state) => state.previewRoute);
  const setPreviewRoute = useUIStore((state) => state.setPreviewRoute);

  const selectedStation = selectedEntity?.type === "station" ? stations.find(s => s.id === selectedEntity.id) : null;
  const selectedSupplier = selectedEntity?.type === "supplier" ? suppliers.find(s => s.id === selectedEntity.id) : null;
  const selectedDrone = selectedEntity?.type === "drone" ? drones.find(d => d.id === selectedEntity.id) : null;
  const selectedRequest = selectedEntity?.type === "request" ? requests.find(r => r.id === selectedEntity.id) : null;
  const selectedZone = selectedEntity?.type === "danger_zone" ? dangerZones.find(z => z.id === selectedEntity.id) : null;

  const [rightOpen, setRightOpen] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    setRightOpen(!isMobile);
  }, [isMobile]);

  const [dispatchDroneId, setDispatchDroneId] = useState<{ [reqId: string]: string }>({});
  const [dispatchSupplierId, setDispatchSupplierId] = useState<{ [reqId: string]: string }>({});
  const [spawnStationId, setSpawnStationId] = useState("");
  const [dispatchError, setDispatchError] = useState("");

  // Euclidean distance calculation helper
  const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  };

  // Telemetry route calculator for manual adjustments
  const updatePreviewRoute = (reqId: string, droneId: string, supplierId: string) => {
    if (!reqId || !droneId || !supplierId) {
      setPreviewRoute(null);
      return;
    }

    const req = requests.find((r) => r.id === reqId);
    const drone = drones.find((d) => d.id === droneId);
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!req || !drone || !supplier) {
      setPreviewRoute(null);
      return;
    }

    const station = stations.find((s) => s.id === drone.stationId);
    if (!station) {
      setPreviewRoute(null);
      return;
    }

    const d1 = getDistance(drone.lat, drone.lng, supplier.lat, supplier.lng);
    const d2 = getDistance(supplier.lat, supplier.lng, req.lat, req.lng);
    const d3 = getDistance(req.lat, req.lng, station.lat, station.lng);
    const totalDist = d1 + d2 + d3;
    const batteryCost = totalDist * 3125;
    const timeSec = totalDist * 3750;

    setPreviewRoute({
      requestId: reqId,
      droneId,
      supplierId,
      dronePath: [[drone.lat, drone.lng], [supplier.lat, supplier.lng]],
      deliveryPath: [[supplier.lat, supplier.lng], [req.lat, req.lng]],
      returnPath: [[req.lat, req.lng], [station.lat, station.lng]],
      totalDistance: totalDist,
      estimatedBatteryCost: batteryCost,
      estimatedTimeSec: timeSec,
    });
  };

  // Selection synchronization: clear preview route when not focusing on requests
  useEffect(() => {
    if (selectedEntity?.type !== "request") {
      setPreviewRoute(null);
    } else if (previewRoute && previewRoute.requestId !== selectedEntity.id) {
      const reqId = selectedEntity.id;
      const droneId = dispatchDroneId[reqId];
      const supplierId = dispatchSupplierId[reqId];
      if (droneId && supplierId) {
        updatePreviewRoute(reqId, droneId, supplierId);
      } else {
        setPreviewRoute(null);
      }
    }
  }, [selectedEntity]);

  // Auto-Optimization Algorithm
  const handleAutoOptimize = (reqId: string) => {
    setDispatchError("");
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;

    // 1. Filter suppliers with sufficient inventory
    const eligibleSuppliers = suppliers.filter((sup) => {
      return Object.entries(req.items).every(([item, qty]) => {
        const stock = sup.inventory?.[item as "medical" | "rations" | "water"] ?? 0;
        return stock >= qty;
      });
    });

    if (eligibleSuppliers.length === 0) {
      setDispatchError("No warehouses have sufficient stock for this request's cargo.");
      setSelectedEntity({ type: "request", id: reqId });
      return;
    }

    // 2. Filter idle drones with battery >= 25%
    const eligibleDrones = drones.filter((d) => d.status === "idle" && d.battery >= 25);
    if (eligibleDrones.length === 0) {
      setDispatchError("No idle drones with battery >= 25% are currently available.");
      setSelectedEntity({ type: "request", id: reqId });
      return;
    }

    interface CandidatePair {
      drone: typeof drones[0];
      supplier: typeof suppliers[0];
      station: typeof stations[0];
      totalDist: number;
      batteryCost: number;
      timeSec: number;
    }
    let bestPair: CandidatePair | null = null;
    let bestFallbackPair: CandidatePair | null = null;

    for (const drone of eligibleDrones) {
      const station = stations.find((s) => s.id === drone.stationId);
      if (!station) continue;

      for (const supplier of eligibleSuppliers) {
        const d1 = getDistance(drone.lat, drone.lng, supplier.lat, supplier.lng);
        const d2 = getDistance(supplier.lat, supplier.lng, req.lat, req.lng);
        const d3 = getDistance(req.lat, req.lng, station.lat, station.lng);
        const totalDist = d1 + d2 + d3;

        // Simulation parameters: 3125% battery lost per degree of distance
        const batteryCost = totalDist * 3125;
        // 1 degree is roughly 1250 ticks. Each tick = 3 seconds. Total seconds = totalDist * 3750.
        const timeSec = totalDist * 3750;

        const meetsSafetyMargin = drone.battery >= (batteryCost + 10);
        const pairInfo = { drone, supplier, station, totalDist, batteryCost, timeSec };

        if (meetsSafetyMargin) {
          if (!bestPair || totalDist < bestPair.totalDist) {
            bestPair = pairInfo;
          }
        } else {
          if (!bestFallbackPair || totalDist < bestFallbackPair.totalDist) {
            bestFallbackPair = pairInfo;
          }
        }
      }
    }

    const selectedPair = bestPair || bestFallbackPair;

    if (!selectedPair) {
      setDispatchError("Could not find a valid route combination.");
      setSelectedEntity({ type: "request", id: reqId });
      return;
    }

    if (!bestPair && bestFallbackPair) {
      setDispatchError("⚠️ Notice: Lowest-distance path selected, but safety margin is <10%.");
    }

    const { drone, supplier, station, totalDist, batteryCost, timeSec } = selectedPair;

    // Save calculation to preview store
    setPreviewRoute({
      requestId: reqId,
      droneId: drone.id,
      supplierId: supplier.id,
      dronePath: [[drone.lat, drone.lng], [supplier.lat, supplier.lng]],
      deliveryPath: [[supplier.lat, supplier.lng], [req.lat, req.lng]],
      returnPath: [[req.lat, req.lng], [station.lat, station.lng]],
      totalDistance: totalDist,
      estimatedBatteryCost: batteryCost,
      estimatedTimeSec: timeSec,
    });

    // Save dropdown assignments
    setDispatchDroneId((prev) => ({ ...prev, [reqId]: drone.id }));
    setDispatchSupplierId((prev) => ({ ...prev, [reqId]: supplier.id }));

    // Focus inspection details
    setSelectedEntity({ type: "request", id: reqId });
  };

  // Spawning Drones at Launchpads
  const handleSpawnDroneAtStation = async (stationId: string) => {
    if (!db || !stationId) return;
    const station = stations.find((s) => s.id === stationId);
    if (!station) return;
    try {
      await addDoc(collection(db, "drones"), {
        name: `Drone SD-${Math.floor(1000 + Math.random() * 9000)}`,
        stationId: stationId,
        lat: station.lat,
        lng: station.lng,
        status: "idle",
        battery: 100,
        currentMissionId: null,
        lastUpdated: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to spawn drone:", err);
    }
  };

  // Adjust Warehouse Inventory Level
  const handleAdjustSupplierInventory = async (supplierId: string, item: "medical" | "rations" | "water", delta: number) => {
    if (!db) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return;
    const currentVal = supplier.inventory?.[item] ?? 0;
    try {
      await updateDoc(doc(db, "suppliers", supplierId), {
        [`inventory.${item}`]: Math.max(0, currentVal + delta),
      });
    } catch (err) {
      console.error("Failed to adjust inventory:", err);
    }
  };

  // Update Hazard Zone severity
  const handleUpdateZoneSeverity = async (zoneId: string, severity: DangerZoneSeverity) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, "danger_zones", zoneId), { severity });
    } catch (err) {
      console.error("Failed to update danger zone severity:", err);
    }
  };

  // Update Hazard Zone radius
  const handleUpdateZoneRadius = async (zoneId: string, radius: number) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, "danger_zones", zoneId), { radius });
    } catch (err) {
      console.error("Failed to update danger zone radius:", err);
    }
  };

  // Abort Mission
  const handleAbortDroneMission = async (droneId: string) => {
    if (!db) return;
    const drone = drones.find((d) => d.id === droneId);
    if (!drone) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "drones", droneId), {
        status: "returning",
        currentMissionId: null,
      });
      if (drone.currentMissionId) {
        batch.update(doc(db, "requests", drone.currentMissionId), {
          status: "pending",
          droneId: null,
          supplierId: null,
        });
      }
      await batch.commit();
      setPreviewRoute(null);
    } catch (err) {
      console.error("Failed to abort mission:", err);
    }
  };

  // Warehouse Loading Controller
  const handleAdminLoadCargo = async (requestId: string, droneId: string, items: { [key: string]: number }, supplierId: string) => {
    if (!db) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    try {
      const batch = writeBatch(db);

      // Deduct items from supplier inventory
      batch.update(doc(db, "suppliers", supplierId), {
        "inventory.medical": Math.max(0, (supplier.inventory?.medical ?? 0) - (items.medical ?? 0)),
        "inventory.rations": Math.max(0, (supplier.inventory?.rations ?? 0) - (items.rations ?? 0)),
        "inventory.water": Math.max(0, (supplier.inventory?.water ?? 0) - (items.water ?? 0)),
      });

      // Set Request Status to "loaded"
      batch.update(doc(db, "requests", requestId), { status: "loaded" });

      // Set Drone Status to "carrying_cargo" (so it departs)
      batch.update(doc(db, "drones", droneId), { status: "carrying_cargo" });

      await batch.commit();
    } catch (err) {
      console.error("Admin cargo load failed:", err);
    }
  };

  // Generic Deletion
  const handleDeleteEntity = async (type: string, id: string) => {
    if (!db) return;
    try {
      let colName = "";
      if (type === "station") colName = "stations";
      else if (type === "supplier") colName = "suppliers";
      else if (type === "drone") colName = "drones";
      else if (type === "request") colName = "requests";
      else if (type === "danger_zone") colName = "danger_zones";

      if (colName) {
        if (type === "request") {
          const req = requests.find((r) => r.id === id);
          if (req?.droneId) {
            await updateDoc(doc(db, "drones", req.droneId), {
              status: "returning",
              currentMissionId: null,
            });
          }
        }
        await deleteDoc(doc(db, colName, id));
        setSelectedEntity(null);
        setPreviewRoute(null);
      }
    } catch (err) {
      console.error(`Failed to delete ${type}:`, err);
    }
  };

  const handleSpawnDrone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !spawnStationId) return;

    const station = stations.find((s) => s.id === spawnStationId);
    if (!station) return;

    try {
      await addDoc(collection(db, "drones"), {
        name: `Drone SD-${Math.floor(1000 + Math.random() * 9000)}`,
        stationId: spawnStationId,
        lat: station.lat,
        lng: station.lng,
        status: "idle",
        battery: 100,
        currentMissionId: null,
        lastUpdated: serverTimestamp(),
      });
      setSpawnStationId("");
    } catch (err) {
      console.error("Failed to spawn drone:", err);
    }
  };

  const handleDispatch = async (requestId: string) => {
    if (!db) return;
    setDispatchError("");

    const droneId = dispatchDroneId[requestId];
    const supplierId = dispatchSupplierId[requestId];

    if (!droneId || !supplierId) {
      setDispatchError("Please select both a drone and a warehouse to dispatch.");
      return;
    }

    const drone = drones.find((d) => d.id === droneId);
    if (!drone) return;

    if (drone.battery < 25) {
      setDispatchError("Selected drone has insufficient battery (<25%) for flight safety.");
      return;
    }

    try {
      const batch = writeBatch(db);

      // 1. Update Request status to dispatched, assign drone & supplier
      const requestRef = doc(db, "requests", requestId);
      batch.update(requestRef, {
        status: "dispatched",
        droneId,
        supplierId,
      });

      // 2. Update Drone status to flying_to_supplier, bind mission ID
      const droneRef = doc(db, "drones", droneId);
      batch.update(droneRef, {
        status: "flying_to_supplier",
        currentMissionId: requestId,
      });

      await batch.commit();

      // Clear route calculations & selection triggers
      setPreviewRoute(null);
      setSelectedEntity(null);
    } catch (err) {
      console.error("Dispatch operation failed:", err);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "requests", id));
      if (selectedEntity?.type === "request" && selectedEntity.id === id) {
        setSelectedEntity(null);
        setPreviewRoute(null);
      }
    } catch (err) {
      console.error("Failed to cancel request:", err);
    }
  };

  // Telemetry Overview Stats
  const activeFlights = drones.filter((d) => d.status !== "idle").length;
  const totalDelivered = requests.filter((r) => r.status === "delivered").length;
  const avgBattery = drones.length > 0 
    ? drones.reduce((sum, d) => sum + d.battery, 0) / drones.length 
    : 100;
  const activePendingRequests = requests.filter((r) => r.status === "pending");
  const activeMissions = requests.filter((r) => r.status === "dispatched" || r.status === "loaded");

  // Available flight drones
  const idleDrones = drones.filter((d) => d.status === "idle" && d.battery >= 25);

  return (
    <SidebarProvider 
      className="w-full flex-1 overflow-hidden flex bg-zinc-50 dark:bg-zinc-950"
      style={{ minHeight: "0px", height: "100%", "--sidebar-width": "20rem" } as React.CSSProperties}
    >
      {/* 1. LEFT SIDEBAR: Controls & Pending Lists */}
      <Sidebar 
        side="left" 
        collapsible="offcanvas" 
        className="border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 flex flex-col h-full z-10"
      >
        <SidebarHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[10px] tracking-widest text-zinc-400 uppercase">Operations Center</span>
          </div>
          <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        </SidebarHeader>

        <SidebarContent className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
          
          {/* Operations Overview stats */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">System Telemetry</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 flex items-center gap-2">
                <Plane className="w-4 h-4 text-indigo-500" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-zinc-400 font-bold block uppercase leading-none">Active</span>
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-100">{activeFlights} / {drones.length}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-zinc-400 font-bold block uppercase leading-none">Delivered</span>
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-100">{totalDelivered}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-amber-500" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-zinc-400 font-bold block uppercase leading-none">Battery</span>
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-100">{avgBattery.toFixed(0)}%</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/80 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-zinc-400 font-bold block uppercase leading-none">Hazards</span>
                  <span className="text-sm font-black text-zinc-800 dark:text-zinc-100">{dangerZones.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Construct Hub Network panel */}
          <div className="space-y-3 p-4 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/60">
            <div className="flex flex-col">
              <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Construct Hub Network</h3>
              <p className="text-[10px] text-zinc-400 mt-0.5">Toggle a building tool, then click Pune map to spawn assets.</p>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={activeTool === "add_station" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTool(activeTool === "add_station" ? "none" : "add_station")}
                  className="w-full text-xs font-semibold py-1 h-auto"
                >
                  <Home className="w-3.5 h-3.5 mr-1" />
                  + Launchpad
                </Button>
                <Button
                  variant={activeTool === "add_supplier" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTool(activeTool === "add_supplier" ? "none" : "add_supplier")}
                  className="w-full text-xs font-semibold py-1 h-auto"
                >
                  <Warehouse className="w-3.5 h-3.5 mr-1" />
                  + Warehouse
                </Button>
              </div>

              <Button
                variant={activeTool === "draw_danger_zone" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTool(activeTool === "draw_danger_zone" ? "none" : "draw_danger_zone")}
                className="w-full text-xs font-semibold text-rose-600 border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 py-1 h-auto"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                ⚠ Paint Flood Hazard Area
              </Button>

              {activeTool === "draw_danger_zone" && (
                <div className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/10 text-[10px] space-y-2.5 mt-2">
                  <div className="flex justify-between items-center">
                    <span>Severity:</span>
                    <select
                      value={dangerZoneSeverity}
                      onChange={(e) => setDangerZoneSeverity(e.target.value as DangerZoneSeverity)}
                      className="border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded p-1 text-[10px]"
                    >
                      <option value="low">Low Warning (Yellow)</option>
                      <option value="medium">Medium Danger (Orange)</option>
                      <option value="high">Critical Risk (Red)</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Radius (meters):</span>
                    <input
                      type="number"
                      min="100"
                      max="3000"
                      value={dangerZoneRadius}
                      onChange={(e) => setDangerZoneRadius(parseInt(e.target.value) || 500)}
                      className="w-20 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded p-1 text-[10px] text-center"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pending Rescue Board Queue */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Rescue Request Board ({activePendingRequests.length})
              </h3>
            </div>
            
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 no-scrollbar">
              {activePendingRequests.map((req) => {
                const isSelected = selectedEntity?.type === "request" && selectedEntity.id === req.id;
                return (
                  <div 
                    key={req.id} 
                    onClick={() => {
                      setSelectedEntity({ type: "request", id: req.id });
                      // If there is already selected drone and supplier, preview it
                      const droneId = dispatchDroneId[req.id];
                      const supplierId = dispatchSupplierId[req.id];
                      if (droneId && supplierId) {
                        updatePreviewRoute(req.id, droneId, supplierId);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all text-xs cursor-pointer flex flex-col gap-2 ${
                      isSelected 
                        ? "bg-indigo-500/10 border-indigo-500 dark:bg-indigo-500/5 shadow-sm" 
                        : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-rose-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        {req.consumerName}
                      </span>
                      <span className="text-[9px] text-zinc-400">ID: {req.id.substring(0, 5)}</span>
                    </div>

                    <div className="space-y-0.5 text-[11px] text-zinc-500">
                      <div>Coords: {req.lat.toFixed(4)}, {req.lng.toFixed(4)}</div>
                      <div>Cargo: {Object.entries(req.items).map(([k, v]) => `${k} (${v})`).join(", ")}</div>
                    </div>

                    <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={() => handleAutoOptimize(req.id)}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 dark:bg-amber-500/90 dark:hover:bg-amber-500 text-white font-semibold py-1 h-auto text-[10px] tracking-wide"
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Auto-Optimize
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelRequest(req.id)}
                        className="px-2 border-rose-200 hover:bg-rose-50 dark:border-rose-950/20 dark:hover:bg-rose-950/10 text-rose-600 font-semibold py-1 h-auto text-[10px]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {activePendingRequests.length === 0 && (
                <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <span className="text-[11px] font-medium">No pending rescue requests</span>
                </div>
              )}
            </div>
          </div>

          {/* Active Missions monitoring */}
          <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-5">
            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Active Missions ({activeMissions.length})
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 no-scrollbar">
              {activeMissions.map((req) => {
                const drone = drones.find((d) => d.id === req.droneId);
                const supplier = suppliers.find((s) => s.id === req.supplierId);
                const isSelected = selectedEntity?.type === "request" && selectedEntity.id === req.id;

                return (
                  <div 
                    key={req.id}
                    onClick={() => setSelectedEntity({ type: "request", id: req.id })}
                    className={`p-3 rounded-xl border text-xs cursor-pointer space-y-2 transition-all ${
                      isSelected 
                        ? "bg-indigo-500/10 border-indigo-500 dark:bg-indigo-500/5 shadow-sm"
                        : "bg-indigo-50/20 dark:bg-indigo-950/5 border-indigo-100/40 dark:border-indigo-900/20 hover:border-indigo-500/30"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-500 capitalize flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                        {req.status}
                      </span>
                      <span className="text-[9px] text-zinc-400">ID: {req.id.substring(0, 5)}</span>
                    </div>

                    <div className="space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                      <div>Survivor: {req.consumerName}</div>
                      <div>Drone: {drone?.name || "Assigning..."} {drone?.battery ? `(${drone.battery.toFixed(0)}%)` : ""}</div>
                      <div>Warehouse: {supplier?.name || "Unknown"}</div>
                      <div className="text-[10px] text-zinc-400 truncate">Cargo: {Object.entries(req.items).map(([k, v]) => `${k} (${v})`).join(", ")}</div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()} className="pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCancelRequest(req.id)}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-1 h-auto text-[10px]"
                      >
                        <Ban className="w-3 h-3 mr-1" />
                        Abort Mission
                      </Button>
                    </div>
                  </div>
                );
              })}

              {activeMissions.length === 0 && (
                <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <span className="text-[11px] font-medium text-zinc-400">No active drone missions</span>
                </div>
              )}
            </div>
          </div>

        </SidebarContent>
      </Sidebar>

      {/* 2. CENTER PANEL: Map Workspace */}
      <main className="flex-1 h-full min-h-0 relative flex flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        
        {/* Sidebar Toggle Controls */}
        <div className="absolute top-3 left-3 z-40 flex gap-2">
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

        {/* Floating warning alert if low battery margin */}
        {dispatchError && (
          <div className="absolute top-14 left-3 z-40 max-w-sm bg-rose-50 dark:bg-rose-950/80 backdrop-blur-sm border border-rose-200 dark:border-rose-800/80 text-rose-600 dark:text-rose-400 px-4 py-3 rounded-2xl shadow-lg text-[11px] font-semibold flex items-start gap-2.5 animate-in slide-in-from-top-4 duration-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <span className="font-bold block text-rose-700 dark:text-rose-300">Dispatch Warning Alert</span>
              <p className="font-medium text-rose-600 dark:text-rose-400/90 mt-0.5">{dispatchError}</p>
            </div>
            <button 
              onClick={() => setDispatchError("")} 
              className="text-rose-400 hover:text-rose-600 font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}

        <div className="flex-1 relative w-full h-full overflow-hidden">
          <MapDashboard mode="admin" />
        </div>
      </main>

      {/* 3. RIGHT SIDEBAR: Selected Asset Inspector & Dispatch Controls */}
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
                Click any Drone, Launchpad, Warehouse, Request pin, or Hazard zone directly on the Pune map to open management consoles here.
              </p>
            </div>
          )}

          {/* 1. Selected Station / Launchpad Details */}
          {selectedEntity?.type === "station" && selectedStation && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Station Spec</div>
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

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <Button 
                  onClick={() => handleSpawnDroneAtStation(selectedStation.id)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Spawn Drone Here
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteEntity("station", selectedStation.id)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Delete Launchpad
                </Button>
              </div>
            </div>
          )}

          {/* 2. Selected Supplier / Warehouse Details */}
          {selectedEntity?.type === "supplier" && selectedSupplier && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-1.5">
                <div className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Warehouse Spec</div>
                <div><strong>Name:</strong> {selectedSupplier.name}</div>
                <div><strong>Coords:</strong> {selectedSupplier.lat.toFixed(5)}, {selectedSupplier.lng.toFixed(5)}</div>
              </div>

              {/* Inventory adjustment counters */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Inventory Supply Levels</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="p-2 bg-rose-500/5 rounded-xl border border-rose-500/10 text-center flex flex-col justify-between items-center gap-1.5">
                    <span className="text-[8px] uppercase font-bold text-rose-500 leading-none">Medical</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.medical ?? 0}</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "medical", -10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        -10
                      </button>
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "medical", 10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                  </div>

                  <div className="p-2 bg-amber-500/5 rounded-xl border border-amber-500/10 text-center flex flex-col justify-between items-center gap-1.5">
                    <span className="text-[8px] uppercase font-bold text-amber-500 leading-none">Rations</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.rations ?? 0}</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "rations", -10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        -10
                      </button>
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "rations", 10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                  </div>

                  <div className="p-2 bg-blue-500/5 rounded-xl border border-blue-500/10 text-center flex flex-col justify-between items-center gap-1.5">
                    <span className="text-[8px] uppercase font-bold text-blue-500 leading-none">Water</span>
                    <span className="text-xs font-black text-zinc-800 dark:text-zinc-100">{selectedSupplier.inventory?.water ?? 0}</span>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "water", -10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        -10
                      </button>
                      <button 
                        onClick={() => handleAdjustSupplierInventory(selectedSupplier.id, "water", 10)} 
                        className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-bold px-1 rounded text-[8px] cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drones loading queue inside warehouse */}
              <div className="space-y-2 pt-2">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">Loading Queue Drones</h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {drones
                    .filter((d) => {
                      if (d.status !== "waiting_for_load" || !d.currentMissionId) return false;
                      const req = requests.find((r) => r.id === d.currentMissionId);
                      return req?.supplierId === selectedSupplier.id;
                    })
                    .map((d) => {
                      const req = requests.find((r) => r.id === d.currentMissionId);
                      return (
                        <div key={d.id} className="p-2.5 rounded-xl border border-amber-500/10 bg-amber-500/5 space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-700 dark:text-amber-500">{d.name} ({d.battery.toFixed(0)}%)</span>
                            <span className="text-[9px] text-zinc-400">Req: {d.currentMissionId?.substring(0, 5)}</span>
                          </div>
                          {req && (
                            <div className="p-1.5 bg-white dark:bg-zinc-900 rounded border border-zinc-150 dark:border-zinc-800">
                              <strong>Cargo:</strong> {Object.entries(req.items).map(([name, qty]) => `${name} (${qty})`).join(", ")}
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => req && handleAdminLoadCargo(req.id, d.id, req.items, selectedSupplier.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1 h-auto text-[10px]"
                          >
                            <PackageOpen className="w-3 h-3 mr-1" />
                            Mark Packed & Loaded
                          </Button>
                        </div>
                      );
                    })}
                  {drones.filter((d) => {
                    if (d.status !== "waiting_for_load" || !d.currentMissionId) return false;
                    const req = requests.find((r) => r.id === d.currentMissionId);
                    return req?.supplierId === selectedSupplier.id;
                  }).length === 0 && (
                    <span className="text-[10px] text-zinc-400 block italic py-2">No drones currently waiting in warehouse.</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteEntity("supplier", selectedSupplier.id)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Delete Warehouse
                </Button>
              </div>
            </div>
          )}

          {/* 3. Selected Drone Details */}
          {selectedEntity?.type === "drone" && selectedDrone && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Drone Specifications</div>
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

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                {selectedDrone.status !== "idle" && (
                  <Button 
                    onClick={() => handleAbortDroneMission(selectedDrone.id)}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-xs font-semibold py-1.5 h-auto text-white"
                  >
                    Abort Mission & Return
                  </Button>
                )}
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteEntity("drone", selectedDrone.id)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Decommission Drone
                </Button>
              </div>
            </div>
          )}

          {/* 4. Selected Request Details & Dispatch controls */}
          {selectedEntity?.type === "request" && selectedRequest && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Request details</span>
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

              {/* Pending flight controls */}
              {selectedRequest.status === "pending" && (
                <div className="space-y-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
                  <span className="font-bold text-[10px] uppercase text-zinc-400 block">Dispatch Command</span>
                  
                  {/* Auto-optimize triggers */}
                  <Button
                    onClick={() => handleAutoOptimize(selectedRequest.id)}
                    className="w-full bg-amber-500 hover:bg-amber-600 dark:bg-amber-500/90 dark:hover:bg-amber-500 text-white font-semibold py-1.5 h-auto text-[11px] tracking-wide"
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    ⚡ Auto-Optimize Route
                  </Button>

                  <div className="h-[1px] bg-zinc-200 dark:bg-zinc-800 my-2"></div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Carrier Drone Selection</label>
                    <select
                      value={dispatchDroneId[selectedRequest.id] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDispatchDroneId({ ...dispatchDroneId, [selectedRequest.id]: val });
                        updatePreviewRoute(selectedRequest.id, val, dispatchSupplierId[selectedRequest.id] || "");
                      }}
                      className="w-full px-2.5 py-1.5 border border-zinc-350 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-lg text-[11px] cursor-pointer"
                    >
                      <option value="">Select Carrier Drone...</option>
                      {idleDrones.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (Battery: {d.battery.toFixed(0)}%)
                        </option>
                      ))}
                      {idleDrones.length === 0 && <option disabled>No idle drones available (min 25% battery)</option>}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Warehouse Supplier</label>
                    <select
                      value={dispatchSupplierId[selectedRequest.id] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDispatchSupplierId({ ...dispatchSupplierId, [selectedRequest.id]: val });
                        updatePreviewRoute(selectedRequest.id, dispatchDroneId[selectedRequest.id] || "", val);
                      }}
                      className="w-full px-2.5 py-1.5 border border-zinc-350 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-lg text-[11px] cursor-pointer"
                    >
                      <option value="">Select Warehouse Supplier...</option>
                      {suppliers.map((s) => {
                        const hasInventory = Object.entries(selectedRequest.items).every(([item, qty]) => {
                          const stock = s.inventory?.[item as "medical" | "rations" | "water"] ?? 0;
                          return stock >= qty;
                        });
                        return (
                          <option key={s.id} value={s.id} className={hasInventory ? "" : "text-zinc-400 bg-zinc-50 dark:bg-zinc-900"}>
                            {s.name} {hasInventory ? "" : "⚠️ (Insufficient Stock)"}
                          </option>
                        );
                      })}
                      {suppliers.length === 0 && <option disabled>No suppliers created yet</option>}
                    </select>
                  </div>

                  {/* Route preview telemetry parameters */}
                  {previewRoute && previewRoute.requestId === selectedRequest.id && (
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-150 dark:border-zinc-850 space-y-1.5 text-[11px] animate-in fade-in duration-200">
                      <span className="font-bold text-[9px] uppercase tracking-wider text-indigo-500 block">Flight Path Preview Telemetry</span>
                      <div className="flex justify-between">
                        <span>Total Flight Distance:</span>
                        <strong>{previewRoute.totalDistance.toFixed(4)} deg</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Est. Travel Duration:</span>
                        <strong>{previewRoute.estimatedTimeSec.toFixed(0)} seconds</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Est. Battery Cost:</span>
                        <strong className={previewRoute.estimatedBatteryCost > 50 ? "text-amber-500" : "text-emerald-500"}>
                          {previewRoute.estimatedBatteryCost.toFixed(1)}%
                        </strong>
                      </div>
                      
                      {/* Safety buffer feedback */}
                      {(() => {
                        const droneObj = drones.find(d => d.id === previewRoute.droneId);
                        if (droneObj) {
                          const batteryCost = previewRoute.estimatedBatteryCost;
                          const hasSafeMargin = droneObj.battery >= (batteryCost + 10);
                          const canComplete = droneObj.battery >= batteryCost;
                          if (!canComplete) {
                            return (
                              <div className="p-1.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-bold text-[9px] text-center mt-1 leading-normal">
                                ❌ CRITICAL: Drone battery ({droneObj.battery.toFixed(0)}%) is insufficient for this journey ({batteryCost.toFixed(0)}%).
                              </div>
                            );
                          } else if (!hasSafeMargin) {
                            return (
                              <div className="p-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-bold text-[9px] text-center mt-1 leading-normal">
                                ⚠️ WARNING: Low safety buffer ({Math.max(0, droneObj.battery - batteryCost).toFixed(0)}% remaining at home).
                              </div>
                            );
                          } else {
                            return (
                              <div className="p-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-bold text-[9px] text-center mt-1 leading-normal">
                                ✅ SAFE JOURNEY: Safe margin verified (+{(droneObj.battery - batteryCost).toFixed(0)}% remaining at home).
                              </div>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <Button
                    onClick={() => handleDispatch(selectedRequest.id)}
                    disabled={!dispatchDroneId[selectedRequest.id] || !dispatchSupplierId[selectedRequest.id]}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-1.5 rounded-lg text-xs"
                  >
                    Dispatch Mission
                  </Button>
                </div>
              )}

              {selectedRequest.status !== "pending" && selectedRequest.status !== "delivered" && (
                <div className="bg-indigo-50/20 dark:bg-indigo-950/10 p-3.5 rounded-xl border border-indigo-100/40 dark:border-indigo-900/20 space-y-1">
                  <div className="font-bold text-[10px] uppercase text-indigo-500 tracking-wider">Mission Telemetry</div>
                  <div><strong>Carrier Drone:</strong> {drones.find(d => d.id === selectedRequest.droneId)?.name || "Assigned"}</div>
                  <div><strong>Warehouse:</strong> {suppliers.find(s => s.id === selectedRequest.supplierId)?.name || "Supplier"}</div>
                </div>
              )}

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteEntity("request", selectedRequest.id)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Cancel / Delete Request
                </Button>
              </div>
            </div>
          )}

          {/* 5. Selected Danger Zone Details */}
          {selectedEntity?.type === "danger_zone" && selectedZone && (
            <div className="space-y-4 text-xs">
              <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2">
                <div className="font-bold text-[11px] uppercase tracking-wider text-zinc-400">Hazard Specifications</div>
                <div><strong>Center Coords:</strong> {selectedZone.centerLat.toFixed(5)}, {selectedZone.centerLng.toFixed(5)}</div>
                
                <div className="flex justify-between items-center">
                  <strong>Severity Warning:</strong>
                  <select
                    value={selectedZone.severity}
                    onChange={(e) => handleUpdateZoneSeverity(selectedZone.id, e.target.value as DangerZoneSeverity)}
                    className="border border-zinc-250 dark:border-zinc-700 bg-white dark:bg-zinc-950 rounded p-1 text-[11px] cursor-pointer"
                  >
                    <option value="low">Low Warning (Yellow)</option>
                    <option value="medium">Medium Danger (Orange)</option>
                    <option value="high">Critical Risk (Red)</option>
                  </select>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>Danger Radius:</span>
                    <span>{selectedZone.radius} meters</span>
                  </div>
                  <input 
                    type="range"
                    min="100"
                    max="3000"
                    step="50"
                    value={selectedZone.radius}
                    onChange={(e) => handleUpdateZoneRadius(selectedZone.id, parseInt(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Button 
                  variant="destructive"
                  onClick={() => handleDeleteEntity("danger_zone", selectedZone.id)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs font-semibold py-1.5 h-auto text-white"
                >
                  Remove Hazard Zone
                </Button>
              </div>
            </div>
          )}

          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
