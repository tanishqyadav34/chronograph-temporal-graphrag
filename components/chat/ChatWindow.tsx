"use client";

import { useRef, useEffect } from "react";
import { mockMessages } from "@/lib/mockMessages";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

export default function ChatWindow() {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-6">
          {mockMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
}
