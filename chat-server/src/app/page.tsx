'use client';

import React, { Suspense } from 'react';
import { SocketProvider } from '@/context/SocketContext';
import MCPChat from '@/components/MCPChat';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="h-screen bg-white">
        <SocketProvider isAdmin={false}>
          <Suspense fallback={<div className="p-4 bg-white text-gray-700">Loading chat...</div>}>
            <MCPChat isAdmin={false} />
          </Suspense>
        </SocketProvider>
      </div>
    </main>
  );
}
