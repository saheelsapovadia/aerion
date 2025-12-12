import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { useGeminiBackend } from './hooks/useGeminiBackend';
import VisualAgent from './components/VisualAgent';
import VisualAgentLowPerf from './components/VisualAgentLowPerf';
import Particles from './components/Particles';
import ParticlesLowPerf from './components/ParticlesLowPerf';
import Controls from './components/Controls';
import MissionTimer from './components/MissionTimer';
import Login from './components/Login';
import { ConnectionState } from './types';

// Performance mode toggle
const USE_LOW_PERF = true; // Set to true for low-end devices
const TRIAL_LIMIT_SECONDS = 120; // 2 minutes free trial

// Helper component for Avatar handling
const UserAvatar = ({ name, picture }: { name: string, picture?: string }) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [picture]);

  if (picture && !imgError) {
    return (
      <img 
        src={picture} 
        alt={name} 
        className="w-8 h-8 rounded-full border border-cyan-500/30 object-cover" 
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full border border-cyan-500/30 bg-cyan-900/20 flex items-center justify-center">
      <span className="text-cyan-500 text-xs font-mono">{name?.[0]?.toUpperCase()}</span>
    </div>
  );
};

const App: React.FC = () => {
  // Shared state for direct visual updates without React render cycle
  const currentAudioLevel = useRef(0);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [trialExpired, setTrialExpired] = useState(false);
  const [trialTimeLeft, setTrialTimeLeft] = useState(TRIAL_LIMIT_SECONDS);

  useEffect(() => {
    // Tag device
    if (!localStorage.getItem('aether_device_id')) {
      const deviceId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('aether_device_id', deviceId);
    }

    // Check trial status
    const usage = parseInt(localStorage.getItem('aether_trial_usage') || '0', 10);
    if (usage >= TRIAL_LIMIT_SECONDS) {
      setTrialExpired(true);
      setTrialTimeLeft(0);
    } else {
      setTrialTimeLeft(TRIAL_LIMIT_SECONDS - usage);
    }

    // Check for auth
    fetch('http://localhost:3001/me', {
      credentials: 'include' // Important for cookies
    })
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('Not authenticated');
    })
    .then(data => {
      setUser(data);
    })
    .catch(() => {
      // Not authenticated
    })
    .finally(() => setLoading(false));
  }, []);

  const {
    connect,
    disconnect,
    connectionState,
    error,
    inputAnalyser,
    outputAnalyser,
    timerState
  } = useGeminiBackend({
    onAudioActivity: (level) => {
      currentAudioLevel.current = level;
    }
  });

  // Handle trial countdown
  useEffect(() => {
    if (user || loading) return;
    
    if (connectionState === ConnectionState.CONNECTED && trialTimeLeft > 0) {
      const interval = setInterval(() => {
        setTrialTimeLeft(prev => {
          const newVal = prev - 1;
          const used = TRIAL_LIMIT_SECONDS - newVal;
          localStorage.setItem('aether_trial_usage', used.toString());
          
          if (newVal <= 0) {
            setTrialExpired(true);
            disconnect();
          }
          return newVal;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [user, loading, connectionState, trialTimeLeft, disconnect]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Ignore if typing in an input or if a button is focused (let default behavior handle buttons)
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'button') {
          return;
        }

        const canInteract = user || (!trialExpired && !loading);
        if (canInteract) {
          e.preventDefault();
          if (connectionState === ConnectionState.CONNECTED) {
            disconnect();
          } else if (connectionState === ConnectionState.DISCONNECTED) {
            connect();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionState, connect, disconnect, user, trialExpired, loading]);

  const showInterface = user || (!trialExpired && !loading);

  return (
    <div className="w-full h-screen bg-black relative overflow-hidden">
      
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black z-0" />

      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 6], fov: 45 }} dpr={USE_LOW_PERF ? 1 : [1, 2]}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} color="#ff00ff" intensity={0.5} />
          
          {/* The Main Entity */}
          {USE_LOW_PERF ? (
            <VisualAgentLowPerf 
              analyserInput={inputAnalyser} 
              analyserOutput={outputAnalyser}
            />
          ) : (
            <VisualAgent 
              analyserInput={inputAnalyser} 
              analyserOutput={outputAnalyser}
            />
          )}
          
          {/* Floating Environment Particles */}
          {USE_LOW_PERF ? (
             <ParticlesLowPerf audioLevel={currentAudioLevel} />
          ) : (
             <Particles audioLevel={currentAudioLevel} />
          )}
          
          {/* Post Processing for cinematic look - skipped in low perf */}
          {!USE_LOW_PERF && (
            <EffectComposer>
              <Bloom 
                luminanceThreshold={0.2} 
                luminanceSmoothing={0.9} 
                height={300} 
                intensity={1.5} 
              />
              <Noise opacity={0.05} />
              <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
          )}
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-8 left-0 w-full text-center pointer-events-none z-10">
        <h1 className="text-3xl font-thin tracking-[0.2em] text-white/80 font-['Space_Grotesk'] uppercase drop-shadow-lg">
          Aether
        </h1>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-cyan-500 to-transparent mx-auto mt-4 opacity-50"></div>
        {!user && !loading && !trialExpired && (
          <div className="mt-2 text-xs text-yellow-500/60 font-mono tracking-widest">
            TRIAL MODE: {Math.floor(trialTimeLeft / 60)}:{(trialTimeLeft % 60).toString().padStart(2, '0')}
          </div>
        )}
      </div>

      {/* HUD: Operator Identity */}
      {user && (
        <div className="absolute top-6 left-6 pointer-events-none z-20">
          <div className="flex flex-col items-start p-4 border-l-2 border-cyan-500/50 bg-black/40 backdrop-blur-md rounded-r-lg shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <span className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-[0.2em] mb-1">
              Operator
            </span>
            <div className="flex items-center gap-3">
              <UserAvatar name={user.name} picture={user.picture} />
              <span className="text-lg text-white font-['Space_Grotesk'] tracking-wide uppercase shadow-black drop-shadow-md">
                {user.name}
              </span>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-cyan-500/50 to-transparent mt-2"></div>
            <span className="text-[8px] text-cyan-500/40 font-mono mt-1">ID: {user.id ? String(user.id).padStart(4, '0') : 'N/A'}</span>
          </div>
        </div>
      )}

      {/* Trial Login Button */}
      {!user && !loading && !trialExpired && (
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={() => window.location.href = 'http://localhost:3001/auth/google'}
            className="group flex items-center gap-2 px-6 py-3 border border-cyan-500/30 bg-black/40 backdrop-blur-sm hover:bg-cyan-900/10 hover:border-cyan-400/60 transition-all duration-300 rounded-lg"
          >
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase group-hover:text-cyan-300">
              Initialize Login
            </span>
            <svg className="w-4 h-4 text-cyan-500 opacity-70 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      )}
      
      {!loading && !user && trialExpired && <Login message="Trial Expired" />}
      {!loading && !user && !trialExpired && connectionState === ConnectionState.DISCONNECTED && (
         /* Optional: Show a "Start Trial" overlay or just let them use Controls? 
            Controls are usually visible. Let's show Login if not trialExpired but maybe they want to login?
            Actually, if trial is active, we just show Controls. But maybe we want a small "Login" button somewhere?
            For now, let's just not show Login until expired.
         */
         null
      )}

      {showInterface && (
        <>
          <MissionTimer state={timerState} />

          <Controls 
            connectionState={connectionState}
            onConnect={() => connect(user)}
            onDisconnect={disconnect}
            error={error}
          />
        </>
      )}
      
      {/* Attribution / Instructions */}
      <div className="absolute bottom-4 left-4 text-[10px] text-gray-600 font-mono z-10 pointer-events-none">
        POWERED BY GEMINI LIVE • USE HEADPHONES FOR BEST EXPERIENCE
      </div>

    </div>
  );
};

export default App;
