import { create } from "zustand";

export interface SelectedEntity {
  type: "station" | "supplier" | "drone" | "request" | "danger_zone";
  id: string;
}

export type MapTool = "none" | "add_station" | "add_supplier" | "draw_danger_zone";
export type DangerZoneSeverity = "low" | "medium" | "high";

export interface PreviewRoute {
  requestId: string;
  droneId: string;
  supplierId: string;
  dronePath: [number, number][];      // Leg 1 (Drone -> Warehouse)
  deliveryPath: [number, number][];   // Leg 2 (Warehouse -> Consumer)
  returnPath: [number, number][];     // Leg 3 (Consumer -> Drone Home)
  totalDistance: number;
  estimatedBatteryCost: number;
  estimatedTimeSec: number;
}

interface UIState {
  // Active map tool (Admin drawing)
  activeTool: MapTool;
  setActiveTool: (tool: MapTool) => void;

  // Theme state
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  // Selected details for creating elements
  selectedCoords: [number, number] | null;
  setSelectedCoords: (coords: [number, number] | null) => void;

  // Settings for danger zones
  dangerZoneSeverity: DangerZoneSeverity;
  setDangerZoneSeverity: (severity: DangerZoneSeverity) => void;
  dangerZoneRadius: number; // in meters
  setDangerZoneRadius: (radius: number) => void;

  // Selected request or drone for detailed inspection
  selectedRequestId: string | null;
  setSelectedRequestId: (id: string | null) => void;
  selectedDroneId: string | null;
  setSelectedDroneId: (id: string | null) => void;

  // Generic selected entity from map
  selectedEntity: SelectedEntity | null;
  setSelectedEntity: (entity: SelectedEntity | null) => void;

  // Consumer specific map interactions
  consumerLandingZone: [number, number] | null;
  setConsumerLandingZone: (coords: [number, number] | null) => void;
  isCustomLandingZone: boolean;
  setIsCustomLandingZone: (val: boolean) => void;

  // Route preview optimization
  previewRoute: PreviewRoute | null;
  setPreviewRoute: (route: PreviewRoute | null) => void;

  // Reset store
  resetStore: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: "none",
  setActiveTool: (tool) => set({ activeTool: tool }),

  theme: "light",
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    set({ theme });
  },

  selectedCoords: null,
  setSelectedCoords: (coords) => set({ selectedCoords: coords }),

  dangerZoneSeverity: "medium",
  setDangerZoneSeverity: (severity) => set({ dangerZoneSeverity: severity }),
  dangerZoneRadius: 500,
  setDangerZoneRadius: (radius) => set({ dangerZoneRadius: radius }),

  selectedRequestId: null,
  setSelectedRequestId: (id) => set({ selectedRequestId: id }),
  selectedDroneId: null,
  setSelectedDroneId: (id) => set({ selectedDroneId: id }),

  selectedEntity: null,
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),

  consumerLandingZone: null,
  setConsumerLandingZone: (coords) => set({ consumerLandingZone: coords }),
  isCustomLandingZone: false,
  setIsCustomLandingZone: (val) => set({ isCustomLandingZone: val }),

  previewRoute: null,
  setPreviewRoute: (route) => set({ previewRoute: route }),

  resetStore: () =>
    set({
      activeTool: "none",
      selectedCoords: null,
      dangerZoneSeverity: "medium",
      dangerZoneRadius: 500,
      selectedRequestId: null,
      selectedDroneId: null,
      selectedEntity: null,
      consumerLandingZone: null,
      isCustomLandingZone: false,
      previewRoute: null,
    }),
}));
