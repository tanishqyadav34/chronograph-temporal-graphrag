"use client";

import { X } from "lucide-react";
import Sidebar from "./Sidebar";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute left-0 top-0 h-full w-64 animate-slide-in shadow-2xl">
        <div className="relative h-full">
          <button
            onClick={onClose}
            className="absolute -right-10 top-3 z-50 rounded-full bg-chrono-surface p-1.5 shadow-lg"
          >
            <X className="h-4 w-4 text-chrono-text" />
          </button>
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
  );
}
