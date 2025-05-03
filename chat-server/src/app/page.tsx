'use client';

import React, { Suspense } from 'react';
import { SocketProvider } from '@/context/SocketContext';
import MCPChat from '@/components/MCPChat';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="h-screen bg-white flex flex-col">
        <SocketProvider isAdmin={false}>
          <Suspense fallback={<div className="p-4 bg-white text-gray-900 font-medium">Loading chat...</div>}>
            <MCPChat isAdmin={false} />
          </Suspense>
        </SocketProvider>
      </div>
    </main>
  );
}
