'use client';

import React from 'react';
import { SocketProvider } from '@/context/SocketContext';
import MCPChat from '@/components/MCPChat';

export default function AdminPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="h-screen">
        <SocketProvider isAdmin={true}>
          <div className="bg-yellow-100 p-2 text-center text-yellow-800 font-bold">
            Admin Mode
          </div>
          <MCPChat isAdmin={true} />
        </SocketProvider>
      </div>
    </main>
  );
} 