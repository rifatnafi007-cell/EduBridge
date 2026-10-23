import type { ReactNode } from "react";
import { Navbar } from "@/components/layout/navbar";
import { ChatWidget } from "@/components/layout/chat-widget";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full max-w-full bg-background overflow-x-hidden">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-3.5 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-24 overflow-x-hidden">
        {children}
      </main>
      <ChatWidget />
    </div>
  );
}
