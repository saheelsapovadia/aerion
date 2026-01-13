import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionState, TimerState, TimerStatus } from '../types';
import { useSoundEffects } from './useSoundEffects';
import { API_BASE_URL } from '../config';

interface UseGeminiBackendProps {
  onAudioActivity?: (volume: number) => void;
}

const SERVER_URL = API_BASE_URL;

// Helper to convert Float32Array to Int16Array
const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
};

// Helper to convert Int16Array to Float32Array  
const int16ToFloat32 = (int16Array: Int16Array): Float32Array => {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32Array;
};

export const useGeminiBackend = ({ onAudioActivity }: UseGeminiBackendProps = {}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  
  // Sound Effects
  const { playStart, playStop, playPause, playResume, playComplete, playBreakStart, playAlert } = useSoundEffects();

  // Timer State
  const [timerState, setTimerState] = useState<TimerState>({
    status: TimerStatus.IDLE,
    timeLeft: 0,
    config: {
      durationMinutes: 25,
      parts: 1,
      breakMinutes: 5,
      goal: "Focus",
      currentPart: 1
    }
  });

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // WebSocket audio mode refs
  const useWebSocketAudioRef = useRef<boolean>(false);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioPlaybackQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : 'session-' + Date.now()
  );

  // --- Timer Logic (Same as original) ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (timerState.status === TimerStatus.RUNNING || timerState.status === TimerStatus.BREAK) {
      interval = setInterval(() => {
        setTimerState(prev => {
          if (prev.timeLeft > 0) {
            return { ...prev, timeLeft: prev.timeLeft - 1 };
          } else {
            const isBreak = prev.status === TimerStatus.BREAK;
            const isFinished = !isBreak && prev.config.currentPart >= prev.config.parts;

            if (isFinished) {
              playComplete();
              return { ...prev, status: TimerStatus.COMPLETED };
            } else if (isBreak) {
              playAlert();
              return {
                ...prev,
                status: TimerStatus.RUNNING,
                timeLeft: prev.config.durationMinutes * 60,
                config: { ...prev.config, currentPart: prev.config.currentPart + 1 }
              };
            } else {
              playBreakStart();
              return {
                ...prev,
                status: TimerStatus.BREAK,
                timeLeft: prev.config.breakMinutes * 60
              };
            }
          }
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [timerState.status, timerState.config, playComplete, playAlert, playBreakStart]);

  // Sync state changes to backend
  const prevStatusRef = useRef(timerState.status);

  useEffect(() => {
    // Only emit if status has actually changed
    if (timerState.status !== prevStatusRef.current) {
      if (socketRef.current && sessionIdRef.current) {
          console.log(`[Frontend] Emitting session update: ${timerState.status}`, timerState.config);
          socketRef.current.emit('client-session-update', {
              status: timerState.status,
              config: timerState.config
          });
      }

      // If finished, generate new ID for NEXT session
      if (timerState.status === TimerStatus.COMPLETED) {
          const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
             ? crypto.randomUUID() 
             : 'session-' + Date.now();
          
          console.log(`[Frontend] Timer finished. Generating new session ID: ${newSessionId}`);
          sessionIdRef.current = newSessionId;

          if (socketRef.current) {
              socketRef.current.emit('update-session-id', newSessionId);
          }
      }

      prevStatusRef.current = timerState.status;
    }
  }, [timerState]); // Depend on full timerState to ensure fresh closure, but filter by status change

  // Play audio from the WebSocket queue
  const playAudioQueue = useCallback((ctx: AudioContext) => {
    if (audioPlaybackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    isPlayingRef.current = true;
    const int16Data = audioPlaybackQueueRef.current.shift()!;
    const float32Data = int16ToFloat32(int16Data);
    
    // Gemini sends 24kHz audio
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);
    
    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    
    // Connect to analyser for visualization
    if (outputAnalyserRef.current) {
      bufferSource.connect(outputAnalyserRef.current);
      outputAnalyserRef.current.connect(ctx.destination);
    } else {
      bufferSource.connect(ctx.destination);
    }
    
    bufferSource.onended = () => {
      playAudioQueue(ctx);
    };
    
    bufferSource.start();
  }, []);

  // Initialize Audio Context
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      inputAnalyserRef.current = audioContextRef.current.createAnalyser();
      inputAnalyserRef.current.fftSize = 256;
      inputAnalyserRef.current.smoothingTimeConstant = 0.5;

      outputAnalyserRef.current = audioContextRef.current.createAnalyser();
      outputAnalyserRef.current.fftSize = 256;
      outputAnalyserRef.current.smoothingTimeConstant = 0.5;
    }
    
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  const connect = useCallback(async (user?: any) => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      const ctx = ensureAudioContext();

      // 1. Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });
      streamRef.current = stream;

      // Setup Input Analyser
      const source = ctx.createMediaStreamSource(stream);
      if (inputAnalyserRef.current) {
        source.connect(inputAnalyserRef.current);
      }

      // 2. Setup Socket & WebRTC
      const socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        withCredentials: true,
        auth: { 
            sessionId: sessionIdRef.current,
            userId: user?.id,
            googleId: user?.google_id
        }
      });
      socketRef.current = socket;

      socket.on('connect_error', (err) => {
        console.error("Socket connection error:", err);
        setError(`Socket error: ${err.message}`);
      });

      socket.on('connect', () => {
        console.log('Connected to signaling server, waiting for transport mode...');
      });

      // Handle transport mode from server
      socket.on('transport-mode', async ({ useWebSocket }: { useWebSocket: boolean }) => {
        console.log(`Transport mode: ${useWebSocket ? 'WebSocket' : 'WebRTC'}`);
        useWebSocketAudioRef.current = useWebSocket;

        if (useWebSocket) {
          // ===== WebSocket Audio Mode =====
          console.log('Setting up WebSocket audio transport');
          
          // Create a separate AudioContext for capture at 16kHz
          const captureCtx = new AudioContext({ sampleRate: 16000 });
          const captureSource = captureCtx.createMediaStreamSource(stream);
          
          // Use ScriptProcessorNode to capture audio chunks
          const processor = captureCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessorRef.current = processor;
          
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16Data = float32ToInt16(inputData);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            socket.emit('audio-data', base64);
          };
          
          captureSource.connect(processor);
          processor.connect(captureCtx.destination); // Required for processing to work
          
          // Handle incoming audio from server
          socket.on('audio-data', (base64Audio: string) => {
            try {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const int16Data = new Int16Array(bytes.buffer);
              audioPlaybackQueueRef.current.push(int16Data);
              
              // Start playback if not already playing
              if (!isPlayingRef.current) {
                playAudioQueue(ctx);
              }
            } catch (e) {
              console.error('Error processing incoming audio:', e);
            }
          });
          
          setConnectionState(ConnectionState.CONNECTED);
          playStart();
          
        } else {
          // ===== WebRTC Audio Mode =====
          console.log('Setting up WebRTC audio transport');
          
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });
          peerConnectionRef.current = pc;

          // Add Local Tracks
          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          // Handle Remote Track
          pc.ontrack = (event) => {
              console.log('Received remote track');
              const remoteStream = event.streams[0] || new MediaStream([event.track]);
              
              if (!remoteAudioRef.current) {
                  remoteAudioRef.current = new Audio();
                  remoteAudioRef.current.autoplay = true;
              }
              remoteAudioRef.current.srcObject = remoteStream;
              
              if (ctx.state === 'running') {
                  try {
                      const remoteSource = ctx.createMediaStreamSource(remoteStream);
                      if (outputAnalyserRef.current) {
                          remoteSource.connect(outputAnalyserRef.current);
                          remoteAudioRef.current.muted = true;
                          outputAnalyserRef.current.connect(ctx.destination);
                      }
                  } catch (e) {
                      console.error("Error connecting remote audio", e);
                  }
              }
          };

          pc.onicecandidate = (event) => {
              if (event.candidate) {
                  socket.emit('ice-candidate', event.candidate);
              }
          };

          // Create Offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', offer);
          
          setConnectionState(ConnectionState.CONNECTED);
          playStart();
        }
      });

      socket.on('answer', async (answer) => {
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(answer);
        }
      });

      socket.on('ice-candidate', async (candidate) => {
          if (peerConnectionRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(candidate);
              } catch (e) { console.error(e); }
          }
      });

      socket.on('tool-call', (data: { name: string, args: any }) => {
        const { name, args } = data;
        console.log('Tool Call Received:', name, args);

        // Update Timer State based on tool call
        switch(name) {
            case 'createSession':
                setTimerState(prev => ({
                    status: TimerStatus.IDLE,
                    timeLeft: (args.durationMinutes || 25) * 60,
                    config: {
                        durationMinutes: args.durationMinutes || 25,
                        parts: args.parts || 1,
                        breakMinutes: args.breakMinutes || 5,
                        goal: args.goal || "Focus Session",
                        currentPart: 1
                    }
                }));
                playBreakStart();
                break;
            case 'startSession':
                setTimerState(prev => ({ ...prev, status: TimerStatus.RUNNING }));
                playStart();
                break;
            case 'pauseSession':
                setTimerState(prev => ({ ...prev, status: TimerStatus.PAUSED }));
                playPause();
                break;
            case 'resumeSession':
                setTimerState(prev => ({ ...prev, status: TimerStatus.RUNNING }));
                playResume();
                break;
            case 'stopSession':
                setTimerState(prev => ({ ...prev, status: TimerStatus.IDLE, timeLeft: 0 }));
                playStop();
                break;
        }
      });

      socket.on('disconnect', () => {
        setConnectionState(ConnectionState.DISCONNECTED);
        playStop();
      });

    } catch (err: any) {
      console.error("Connection failed", err);
      setConnectionState(ConnectionState.ERROR);
      setError(err.message);
      playStop();
    }
  }, [ensureAudioContext, playStart, playStop, playPause, playResume, playBreakStart, playAudioQueue]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
    }
    if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current = null;
    }
    // Clean up WebSocket audio resources
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    audioPlaybackQueueRef.current = [];
    isPlayingRef.current = false;
    useWebSocketAudioRef.current = false;
    
    setConnectionState(ConnectionState.DISCONNECTED);
    playStop();
  }, [playStop]);

  // Animation Loop for Volume
  useEffect(() => {
    let animationFrameId: number;
    const dataArray = new Uint8Array(32);
    
    const updateVolume = () => {
      let maxVolume = 0;
      if (inputAnalyserRef.current) {
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        const inputVol = sum / dataArray.length;
        if (inputVol > maxVolume) maxVolume = inputVol;
      }
      
      if (outputAnalyserRef.current) {
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        const outputVol = sum / dataArray.length;
        if (outputVol > maxVolume) maxVolume = outputVol;
      }

      if (onAudioActivity) {
        onAudioActivity(maxVolume / 255);
      }
      
      animationFrameId = requestAnimationFrame(updateVolume);
    };
    
    updateVolume();
    return () => cancelAnimationFrame(animationFrameId);
  }, [onAudioActivity]);

  return {
    connect,
    disconnect,
    connectionState,
    error,
    inputAnalyser: inputAnalyserRef,
    outputAnalyser: outputAnalyserRef,
    timerState
  };
};

