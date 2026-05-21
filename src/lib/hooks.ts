import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";

// Drone Type Definition
export interface Drone {
  id: string;
  name: string;
  stationId: string;
  lat: number;
  lng: number;
  status: "idle" | "flying_to_supplier" | "waiting_for_load" | "carrying_cargo" | "returning";
  battery: number;
  currentMissionId: string | null;
}

// Station Type Definition
export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

// Supplier Type Definition
export interface Supplier {
  id: string;
  name: string;
  lat: number;
  lng: number;
  inventory: { [itemId: string]: number };
}

// Request Type Definition
export interface DeliveryRequest {
  id: string;
  consumerId: string;
  consumerName: string;
  lat: number;
  lng: number;
  items: { [itemId: string]: number };
  status: "pending" | "dispatched" | "loaded" | "delivered";
  droneId: string | null;
  supplierId: string | null;
  createdAt: any;
}

// Danger Zone Type Definition
export interface DangerZone {
  id: string;
  centerLat: number;
  centerLng: number;
  radius: number;
  severity: "low" | "medium" | "high";
}

// Generic Hook creator for real-time Firestore collections synced with React Query cache
function createFirestoreCollectionHook<T>(collectionName: string, queryConstraints?: any) {
  return () => {
    const queryClient = useQueryClient();
    const queryKey = [collectionName];

    useEffect(() => {
      if (!db) return;
      const ref = collection(db, collectionName);
      const q = queryConstraints ? query(ref, queryConstraints) : ref;
      
      const unsubscribe = onSnapshot(ref, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as unknown as T[];
        queryClient.setQueryData(queryKey, data);
      });
      return () => unsubscribe();
    }, [queryClient]);

    return useQuery({
      queryKey,
      queryFn: () => [] as unknown as T[],
      initialData: [] as unknown as T[],
      staleTime: Infinity,
    });
  };
}

export const useDrones = createFirestoreCollectionHook<Drone>("drones");
export const useStations = createFirestoreCollectionHook<Station>("stations");
export const useSuppliers = createFirestoreCollectionHook<Supplier>("suppliers");
export const useRequests = createFirestoreCollectionHook<DeliveryRequest>("requests");
export const useDangerZones = createFirestoreCollectionHook<DangerZone>("danger_zones");

// Real-time user profile listener hook
export function useUserProfile(uid: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["userProfile", uid];

  useEffect(() => {
    if (!db || !uid) return;
    const userDocRef = doc(db, "users", uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        queryClient.setQueryData(queryKey, { id: snapshot.id, ...snapshot.data() });
      }
    });
    return () => unsubscribe();
  }, [uid, queryClient]);

  return useQuery({
    queryKey,
    queryFn: () => null as any,
    enabled: !!uid,
    staleTime: Infinity,
  });
}
