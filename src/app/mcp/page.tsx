'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loading } from '@/components/Loading';

// Dynamically import MCPChat with SSR disabled to prevent hydration issues
const MCPChat = dynamic(
  () => import('@/components/MCPChat').then((mod) => mod.MCPChat),
  { 
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <Loading text="Loading chat..." size="lg" />
      </div>
    )
  }
);

// Main component with admin check
export default function MCPPage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Helper function to check if admin mode should be active
  const checkAdminMode = (): boolean => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return false; // Default to false on server-side rendering
    }
    
    // Check if we're on localhost or development
    const isLocalEnv = window.location.hostname.includes('localhost') || 
                       window.location.hostname.includes('127.0.0.1');
    
    // If on local environment, use the query parameter
    if (isLocalEnv) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('admin') === 'true') {
        return true;
      }
      return false;
    }
    
    // In production, use the state from JWT verification
    return isAdmin;
  };
  
  // Check if user is admin by verifying JWT token (only in production)
  useEffect(() => {
    // Skip in server-side rendering
    if (typeof window === 'undefined') return;
    
    const checkAdminPermission = async () => {
      // Check for admin=true query parameter in localhost for testing
      const isLocalEnv = window.location.hostname.includes('localhost') || 
                        window.location.hostname.includes('127.0.0.1');
      
      // If we're on localhost, check for admin query parameter
      if (isLocalEnv) {
        const urlParams = new URLSearchParams(window.location.search);
        const adminParam = urlParams.get('admin');
        
        if (adminParam === 'true') {
          console.log('🔒 Admin mode enabled via query parameter');
          setIsAdmin(true);
          return;
        }
        
        console.log('🔒 Admin check skipped in development environment');
        return;
      }

      try {
        // Get the token from cookies
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
        
        const token = cookies['token'];
        
        if (!token) {
          console.log('🔒 No JWT token found in cookies');
          return;
        }
        
        // Verify token on server
        const response = await fetch('/api/verify-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token })
        });
        
        if (!response.ok) {
          console.log('🔒 Token verification failed');
          return;
        }
        
        const { isValid, decoded } = await response.json();
        
        if (isValid && decoded && decoded.role === 'admin') {
          console.log('🔒 Admin role verified');
          setIsAdmin(true);
        } else {
          console.log('🔒 User does not have admin role:', decoded?.role);
        }
      } catch (error) {
        console.error('❌ Error verifying JWT token:', error);
      }
    };
    
    checkAdminPermission();
  }, []);

  // Get MCP server URL from environment
  const mcpServerUrl = process.env.NEXT_PUBLIC_MCP_URL || undefined;

  return <MCPChat isAdmin={checkAdminMode()} serverUrl={mcpServerUrl} />;
} 