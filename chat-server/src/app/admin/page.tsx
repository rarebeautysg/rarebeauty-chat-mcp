'use client';

import React, { Suspense } from 'react';
import { SocketProvider } from '@/context/SocketContext';
import MCPChat from '@/components/MCPChat';
import AdminControls from '@/components/AdminControls';

export default function AdminPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <div className="h-screen bg-white flex flex-col">
        <SocketProvider isAdmin={true}>
          <div className="bg-yellow-100 p-2 text-center text-yellow-800 font-bold">
            Admin Mode
          </div>
          <AdminControls />
          <Suspense fallback={<div className="p-4 bg-white text-gray-900 font-medium">Loading admin chat...</div>}>
            <MCPChat isAdmin={true} />
          </Suspense>
        </SocketProvider>
      </div>
    </main>
  );
} 