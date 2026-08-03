"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import GraphPanel from "@/components/graph/GraphPanel";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "graph">("chat");
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-chrono-bg">
      <Navbar onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Mobile/Tablet Sidebar Drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-64 animate-slide-in shadow-2xl">
              <div className="relative h-full">
                <Sidebar />
              </div>
            </div>
            <style jsx>{`
              @keyframes slideIn {
                from {
                  transform: translateX(-100%);
                }
                to {
                  transform: translateX(0);
                }
              }
              .animate-slide-in {
                animation: slideIn 0.2s ease-out;
              }
            `}</style>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat Panel */}
          <div
            className={`flex-1 overflow-hidden ${
              isMobile && activeTab !== "chat" ? "hidden" : ""
            }`}
          >
            <ChatWindow />
          </div>

          {/* Mobile Tab Switcher */}
          {(isMobile || isTablet) && (
            <div className="fixed bottom-20 left-1/2 z-20 -translate-x-1/2">
              <div className="flex overflow-hidden rounded-xl border border-chrono-border bg-chrono-surface shadow-2xl">
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    activeTab === "chat"
                      ? "bg-gradient-to-r from-chrono-primary to-chrono-violet text-white"
                      : "text-chrono-text-muted hover:text-chrono-text"
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setActiveTab("graph")}
                  className={`px-4 py-2 text-xs font-medium transition-colors ${
                    activeTab === "graph"
                      ? "bg-gradient-to-r from-chrono-primary to-chrono-violet text-white"
                      : "text-chrono-text-muted hover:text-chrono-text"
                  }`}
                >
                  Graph
                </button>
              </div>
            </div>
          )}

          {/* Right Panel - Knowledge Graph / Timeline */}
          <div
            className={`${
              isMobile
                ? activeTab === "graph"
                  ? "fixed inset-0 z-10 bg-chrono-bg"
                  : "hidden"
                : isTablet
                ? activeTab === "graph"
                  ? "fixed inset-0 z-10 bg-chrono-bg"
                  : "hidden"
                : "block w-96 lg:w-[380px] xl:w-[420px]"
            } border-l border-chrono-border bg-chrono-surface overflow-hidden`}
          >
            <GraphPanel onClose={() => setActiveTab("chat")} />
          </div>
        </div>
      </div>
    </div>
  );
}
