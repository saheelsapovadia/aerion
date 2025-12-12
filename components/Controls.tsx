import React from 'react';
import { ConnectionState } from '../types';

interface ControlsProps {
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  error: string | null;
}

const Controls: React.FC<ControlsProps> = ({ connectionState, onConnect, onDisconnect, error }) => {
  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center justify-center pointer-events-none z-10">
      
      {error && (
        <div className="mb-4 px-4 py-2 bg-red-500/20 border border-red-500 text-red-200 rounded-lg backdrop-blur-md animate-pulse">
          {error}
        </div>
      )}

      <div className="pointer-events-auto flex flex-col items-center gap-4">
        {/* Status Indicator */}
        <div className={`text-sm tracking-widest uppercase font-mono ${
          isConnected ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'text-gray-500'
        }`}>
          {connectionState}
        </div>

        {/* Main Interaction Button */}
        <button
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={isConnecting}
          className={`
            relative group flex items-center justify-center w-20 h-20 rounded-full 
            transition-all duration-500 ease-out
            ${isConnected 
              ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]' 
              : 'bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.3)]'
            }
            ${isConnecting ? 'opacity-50 cursor-not-allowed animate-pulse' : 'cursor-pointer'}
          `}
        >
          {/* Icon */}
          <div className={`transform transition-transform duration-300 ${isConnected ? 'scale-100' : 'scale-100'}`}>
            {isConnected ? (
               // Stop Icon
               <div className="w-6 h-6 bg-red-400 rounded-sm shadow-[0_0_10px_currentColor]" />
            ) : (
               // Mic/Start Icon
               <svg className="w-8 h-8 text-cyan-400 drop-shadow-[0_0_10px_currentColor]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
               </svg>
            )}
          </div>
          
          {/* Ring Animation */}
          <div className={`absolute inset-0 rounded-full border border-current opacity-30 scale-110 ${isConnected ? 'text-red-500 animate-ping' : 'text-cyan-500'}`} />
        </button>
        
        {!isConnected && !isConnecting && (
           <p className="text-xs text-gray-400 font-light tracking-wide opacity-60 mt-2">TAP OR SPACE TO INITIALIZE LINK</p>
        )}
      </div>
    </div>
  );
};

export default Controls;