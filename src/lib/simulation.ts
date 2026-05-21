import { doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { Drone, DeliveryRequest, Station, Supplier } from "./hooks";

// Speed of drone in coordinates per tick (roughly ~100m per tick at 0.0009 degrees)
const FLIGHT_SPEED = 0.0008; 
const BATTERY_DRAIN_RATE = 2.5; // Battery % lost per flight tick
const BATTERY_RECHARGE_RATE = 5.0; // Battery % gained per idle dock tick

// Helper to move point A towards point B
function moveTowards(current: [number, number], target: [number, number], speed: number) {
  const [cLat, cLng] = current;
  const [tLat, tLng] = target;
  
  const dLat = tLat - cLat;
  const dLng = tLng - cLng;
  const distance = Math.sqrt(dLat * dLat + dLng * dLng);
  
  if (distance <= speed) {
    return { coords: target, arrived: true };
  }
  
  const angle = Math.atan2(dLat, dLng);
  const nextLat = cLat + Math.sin(angle) * speed;
  const nextLng = cLng + Math.cos(angle) * speed;
  return { coords: [nextLat, nextLng] as [number, number], arrived: false };
}

// Main tick updater for all drones in the system
export async function runSimulationTick(
  drones: Drone[],
  requests: DeliveryRequest[],
  stations: Station[],
  suppliers: Supplier[]
) {
  if (!db || drones.length === 0) return;

  const batch = writeBatch(db);
  let hasUpdates = false;

  for (const drone of drones) {
    const droneRef = doc(db, "drones", drone.id);
    let updatedDrone: Partial<Drone> = {};
    let shouldUpdate = false;

    // Retrieve associated request/mission if active
    const activeRequest = drone.currentMissionId
      ? requests.find((r) => r.id === drone.currentMissionId)
      : null;

    // Retrieve associated supplier
    const activeSupplier = activeRequest
      ? suppliers.find((s) => s.id === activeRequest.supplierId)
      : null;

    // Retrieve station (home)
    const homeStation = stations.find((s) => s.id === drone.stationId);

    // If mission request is deleted/cancelled, abort and return
    if (drone.currentMissionId && !activeRequest) {
      updatedDrone.status = "returning";
      updatedDrone.currentMissionId = null;
      shouldUpdate = true;
    }

    // 1. Idle and charging state at home station
    else if (drone.status === "idle") {
      if (drone.battery < 100) {
        updatedDrone.battery = Math.min(100, drone.battery + BATTERY_RECHARGE_RATE);
        shouldUpdate = true;
      }
      
      // Snap to home station coordinates just in case
      if (homeStation && (drone.lat !== homeStation.lat || drone.lng !== homeStation.lng)) {
        updatedDrone.lat = homeStation.lat;
        updatedDrone.lng = homeStation.lng;
        shouldUpdate = true;
      }
    }

    // 2. Flying to Supplier to pick up emergency cargo
    else if (drone.status === "flying_to_supplier" && activeRequest && activeSupplier) {
      const { coords, arrived } = moveTowards(
        [drone.lat, drone.lng],
        [activeSupplier.lat, activeSupplier.lng],
        FLIGHT_SPEED
      );
      
      updatedDrone.lat = coords[0];
      updatedDrone.lng = coords[1];
      updatedDrone.battery = Math.max(0, drone.battery - BATTERY_DRAIN_RATE);
      shouldUpdate = true;

      if (arrived) {
        updatedDrone.status = "waiting_for_load";
      }
    }

    // 3. Waiting for Supplier load at supplier warehouse
    else if (drone.status === "waiting_for_load") {
      // Coordinates stay static. Waiting for Supplier dashboard interaction.
    }

    // 4. Carrying cargo to Consumer safe landing zone
    else if (drone.status === "carrying_cargo" && activeRequest) {
      const { coords, arrived } = moveTowards(
        [drone.lat, drone.lng],
        [activeRequest.lat, activeRequest.lng],
        FLIGHT_SPEED
      );

      updatedDrone.lat = coords[0];
      updatedDrone.lng = coords[1];
      updatedDrone.battery = Math.max(0, drone.battery - BATTERY_DRAIN_RATE);
      shouldUpdate = true;

      if (arrived) {
        // Drone landed, set delivery request status to delivered, and fly back
        const requestRef = doc(db, "requests", activeRequest.id);
        batch.update(requestRef, { status: "delivered" });
        updatedDrone.status = "returning";
      }
    }

    // 5. Returning back to Station (recharge dock)
    else if (drone.status === "returning" && homeStation) {
      const { coords, arrived } = moveTowards(
        [drone.lat, drone.lng],
        [homeStation.lat, homeStation.lng],
        FLIGHT_SPEED
      );

      updatedDrone.lat = coords[0];
      updatedDrone.lng = coords[1];
      updatedDrone.battery = Math.max(0, drone.battery - BATTERY_DRAIN_RATE);
      shouldUpdate = true;

      if (arrived) {
        updatedDrone.status = "idle";
        updatedDrone.currentMissionId = null;
        
        // If there was an active request, clear its drone association just in case
        if (drone.currentMissionId) {
          const requestRef = doc(db, "requests", drone.currentMissionId);
          batch.update(requestRef, { droneId: null });
        }
      }
    }

    if (shouldUpdate) {
      batch.update(droneRef, updatedDrone);
      hasUpdates = true;
    }
  }

  if (hasUpdates) {
    await batch.commit();
  }
}
