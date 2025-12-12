import React from 'react';
import { TimerState, TimerStatus } from '../types';

interface MissionTimerProps {
  state: TimerState;
}

const MissionTimer: React.FC<MissionTimerProps> = ({ state }) => {
  const { status, timeLeft, config } = state;

  if (status === TimerStatus.IDLE && timeLeft === 0) return null;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (status) {
      case TimerStatus.RUNNING: return 'text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]';
      case TimerStatus.PAUSED: return 'text-yellow-400 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)]';
      case TimerStatus.BREAK: return 'text-green-400 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]';
      case TimerStatus.COMPLETED: return 'text-blue-300 border-blue-400/50 shadow-[0_0_20px_rgba(147,197,253,0.3)]';
      default: return 'text-gray-400 border-gray-500/50';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case TimerStatus.RUNNING: return 'SEQUENCE ACTIVE';
      case TimerStatus.PAUSED: return 'SEQUENCE PAUSED';
      case TimerStatus.BREAK: return 'CYCLE COOLDOWN';
      case TimerStatus.COMPLETED: return 'MISSION COMPLETE';
      default: return 'READY';
    }
  };

  return (
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full max-w-md pointer-events-none">
      
      {/* Holographic HUD Container */}
      <div className={`
        relative flex flex-col items-center p-6 rounded-xl border backdrop-blur-sm bg-black/40 transition-all duration-500
        ${getStatusColor()}
      `}>
        
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-current -translate-x-1 -translate-y-1"></div>
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-current translate-x-1 -translate-y-1"></div>
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-current -translate-x-1 translate-y-1"></div>
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-current translate-x-1 translate-y-1"></div>

        {/* Label */}
        <div className="flex items-center gap-2 mb-2 opacity-80">
           <div className={`w-2 h-2 rounded-full ${status === TimerStatus.RUNNING ? 'animate-pulse bg-current' : 'bg-current'}`}></div>
           <span className="text-[10px] tracking-[0.2em] font-bold font-mono uppercase">
             {getStatusText()}
           </span>
        </div>

        {/* Main Timer */}
        <div className="text-6xl font-['Space_Grotesk'] font-light tracking-widest tabular-nums drop-shadow-md">
          {formatTime(timeLeft)}
        </div>

        {/* Mission Data */}
        <div className="w-full mt-4 flex justify-between items-end text-xs font-mono uppercase opacity-70">
           <div className="flex flex-col items-start">
             <span className="text-[8px] opacity-50 mb-0.5">Objective</span>
             <span className="tracking-wider text-white">{config.goal}</span>
           </div>
           
           <div className="flex flex-col items-end">
             <span className="text-[8px] opacity-50 mb-0.5">Segment</span>
             <span className="tracking-wider text-white">
                {config.parts > 1 ? `${config.currentPart} / ${config.parts}` : 'SINGLE'}
             </span>
           </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-gray-800 mt-4 rounded-full overflow-hidden relative">
           {status === TimerStatus.RUNNING && (
             <div className="absolute inset-0 bg-current opacity-50 animate-[progress_2s_ease-in-out_infinite]"></div>
           )}
           <div 
             className="h-full bg-current transition-all duration-1000 ease-linear"
             style={{ width: `${(timeLeft / (status === TimerStatus.BREAK ? config.breakMinutes * 60 : config.durationMinutes * 60)) * 100}%` }}
           />
        </div>
      </div>

      {/* Decorative Scan Lines */}
      <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(0deg,transparent_50%,#fff_50%)] bg-[length:100%_4px]"></div>
    </div>
  );
};

export default MissionTimer;
