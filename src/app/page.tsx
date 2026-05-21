"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/20 flex flex-col justify-between">
      
      {/* Brand Header */}
      <header className="px-6 py-6 border-b border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-md bg-white/70 dark:bg-zinc-950/70 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold tracking-wider shadow-md shadow-indigo-500/20">
              S
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
              SkyDrop
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="font-semibold text-xs">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-4 rounded-lg shadow-md shadow-indigo-600/10">
                Register Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Body Section */}
      <main className="flex-1 max-w-5xl mx-auto px-6 flex flex-col justify-center text-center items-center py-20">
        
        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 border border-rose-500/20 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          Emergency Disaster Relief Program
        </span>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] mb-6 max-w-3xl">
          Last-Mile Aerial Logistics in{" "}
          <span className="bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
            Crisis Zones
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          SkyDrop coordinates a fleet of autonomous emergency response drones to transport life-essential medicine, rations, and clean drinking water to isolated settlements in the Pune region.
        </p>

        {/* CTA Actions */}
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link href="/register">
            <Button size="lg" className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-6 px-8 rounded-xl shadow-lg shadow-indigo-600/25 transition-transform active:scale-95 duration-100 text-sm">
              Deploy Dashboard MVP
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg" className="w-full sm:w-auto border-zinc-300 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/50 py-6 px-8 rounded-xl text-sm font-semibold">
              Enter Operations Portal
            </Button>
          </Link>
        </div>

        {/* Showcase Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-24">
          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-left">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold mb-4">
              🚁
            </div>
            <h3 className="font-bold text-sm mb-1.5">Fleet Telemetry Control</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Admins track autonomous drone battery limits, dispatch flights manually, and dynamically map danger boundaries.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold mb-4">
              📦
            </div>
            <h3 className="font-bold text-sm mb-1.5">Supplier Cargo Packaging</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Warehouses manage emergency supply registries and pack incoming drone slots to kickstart cargo flights.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-left">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold mb-4">
              📍
            </div>
            <h3 className="font-bold text-sm mb-1.5">Survivor Drop Location</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Survivors use auto-geolocation to pinpoint clear drop sites and track inbound carrier stats in real-time.
            </p>
          </div>
        </div>

      </main>

      {/* Simple Footer */}
      <footer className="py-8 px-6 text-center text-xs text-zinc-500 dark:text-zinc-600 border-t border-zinc-200/40 dark:border-zinc-800/40">
        &copy; {new Date().getFullYear()} SkyDrop Autonomous Systems. Proof of Concept Disaster Response Portal.
      </footer>

    </div>
  );
}
