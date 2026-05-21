"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useUserProfile, useDrones, useRequests, useStations, useSuppliers } from "@/lib/hooks";
import { runSimulationTick } from "@/lib/simulation";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/store";
import { Sun, Moon } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthAndSimulationWrapper>{children}</AuthAndSimulationWrapper>
    </QueryClientProvider>
  );
}

function AuthAndSimulationWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }, [setTheme]);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // 1. Listen to Auth state
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
        router.push("/login");
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // 2. Fetch User Profile from Firestore using custom hook
  const { data: userProfile, isLoading: profileLoading } = useUserProfile(currentUser?.uid);

  // 3. Fetch all system collections to feed the simulation
  const { data: drones = [] } = useDrones();
  const { data: requests = [] } = useRequests();
  const { data: stations = [] } = useStations();
  const { data: suppliers = [] } = useSuppliers();

  // 4. Role-based Route Guarding
  useEffect(() => {
    if (authLoading || profileLoading || !userProfile) return;

    const role = userProfile.role;
    const isAccessingAdmin = pathname.startsWith("/dashboard/admin");
    const isAccessingSupplier = pathname.startsWith("/dashboard/supplier");
    const isAccessingConsumer = pathname.startsWith("/dashboard/consumer");

    if (role === "admin" && !isAccessingAdmin) {
      router.push("/dashboard/admin");
    } else if (role === "supplier" && !isAccessingSupplier) {
      router.push("/dashboard/supplier");
    } else if (role === "consumer" && !isAccessingConsumer) {
      router.push("/dashboard/consumer");
    }
  }, [userProfile, pathname, authLoading, profileLoading, router]);

  // 5. Active Flight Simulation Tick Loop
  useEffect(() => {
    if (!userProfile) return;
    
    // Check if there are any active flights that need updating
    const hasActiveMissions = drones.some((d) => d.status !== "idle" || d.battery < 100);
    if (!hasActiveMissions) return;

    // Run simulation tick every 3 seconds
    const interval = setInterval(async () => {
      try {
        await runSimulationTick(drones, requests, stations, suppliers);
      } catch (err) {
        console.error("Simulation tick error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [drones, requests, stations, suppliers, userProfile]);

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push("/login");
    }
  };

  if (authLoading || (currentUser && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-600 font-sans">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-semibold text-zinc-950 dark:text-zinc-50">Authenticating Terminal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden">
      {/* Premium Dashboard Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200/80 dark:border-zinc-800/80 px-6 py-4">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold tracking-wider shadow-md shadow-indigo-500/20">
              S
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
              SkyDrop Console
            </span>
          </div>

          {userProfile && (
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold">{userProfile.name}</span>
                <span className="text-xs text-zinc-400 capitalize font-medium">{userProfile.role} Account</span>
              </div>
              
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 capitalize">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                {userProfile.role} Mode
              </span>

              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-amber-500" />
                ) : (
                  <Moon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                )}
              </button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
