"use client";

import { useState } from "react";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import ChatWindow from "@/components/chat/ChatWindow";
import GraphPanel from "@/components/graph/GraphPanel";
import { ChatProvider, useChat } from "@/lib/chat-context";
import { HighlightProvider } from "@/lib/highlight-context";

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "graph">("chat");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const { newConversation } = useChat();

  const startNewChat = () => {
    newConversation();
    setActiveTab("chat");
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-chrono-bg">
      <Navbar
        onMenuClick={() => setSidebarOpen(true)}
        onNewChat={startNewChat}
        onTogglePanel={() => setPanelCollapsed((c) => !c)}
        panelCollapsed={panelCollapsed}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — visible on md and up */}
        <div className="hidden md:block">
          <Sidebar onNewConversation={startNewChat} />
        </div>

        {/* Chat Panel — full width on mobile, flex-1 on md+ */}
        <div
          className={`flex-1 overflow-hidden ${
            activeTab !== "chat" ? "hidden" : ""
          } md:block`}
        >
          <ChatWindow />
        </div>

        {/* Right Panel — Knowledge Graph / Timeline (collapsible on md+).
            Mobile visibility is driven by activeTab; the collapse toggle only
            affects the md+ width, so widths never conflict. */}
        <div
          className={`${
            activeTab === "graph" ? "fixed inset-0 z-10 bg-chrono-bg" : "hidden"
          } overflow-hidden border-l border-chrono-border bg-chrono-surface md:static md:z-auto md:block md:transition-[width] md:duration-300 md:ease-in-out ${
            panelCollapsed ? "md:w-0 md:border-l-0" : "md:w-[320px] xl:w-[420px]"
          }`}
        >
          <GraphPanel onClose={() => setActiveTab("chat")} />
        </div>
      </div>

      {/* Mobile Tab Switcher (below md) */}
      <div className="fixed bottom-20 left-1/2 z-20 -translate-x-1/2 md:hidden">
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

      {/* Mobile/Tablet Sidebar Drawer (below md) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 animate-slide-in shadow-2xl">
            <div className="relative h-full">
              <Sidebar onNewConversation={startNewChat} />
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
    </div>
  );
}

export default function Home() {
  return (
    <ChatProvider>
      <HighlightProvider>
        <AppShell />
      </HighlightProvider>
    </ChatProvider>
  );
}
