'use client';

import React, { Suspense } from 'react';
import { SocketProvider } from '@/context/SocketContext';
import MCPChat from '@/components/MCPChat';

export default function AdminPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="h-screen bg-white">
        <SocketProvider isAdmin={true}>
          <div className="bg-yellow-100 p-2 text-center text-yellow-800 font-bold">
            Admin Mode
          </div>
          <Suspense fallback={<div className="p-4 bg-white text-gray-700">Loading admin chat...</div>}>
            <MCPChat isAdmin={true} />
          </Suspense>
        </SocketProvider>
      </div>
    </main>
  );
} 