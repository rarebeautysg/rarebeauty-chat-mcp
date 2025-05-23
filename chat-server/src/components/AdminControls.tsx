import React from 'react';
import { useSocket } from '@/context/SocketContext';

const AdminControls: React.FC = () => {
  const { clearContext, clearHistory } = useSocket();

  return (
    <div className="bg-gray-100 p-2 flex justify-center space-x-4 border-b border-gray-200">
      <button
        onClick={clearContext}
        className="bg-red-500 text-white rounded-md px-3 py-1 text-sm hover:bg-red-600"
      >
        Clear All Context
      </button>
      <button
        onClick={clearHistory}
        className="bg-orange-500 text-white rounded-md px-3 py-1 text-sm hover:bg-orange-600"
      >
        Clear Chat History
      </button>
    </div>
  );
};

export default AdminControls; 