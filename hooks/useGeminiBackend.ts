import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionState, TimerState, TimerStatus } from '../types';
import { useSoundEffects } from './useSoundEffects';
import { logger } from '../utils/logger';

interface UseGeminiBackendProps {
  onAudioActivity?: (volume: number) => void;
}

import { API_BASE_URL } from '../config';

const SERVER_URL = API_BASE_URL;

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
          logger.debug(`[Frontend] Emitting session update: ${timerState.status}`, timerState.config);
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
          
          logger.info(`[Frontend] Timer finished. Generating new session ID: ${newSessionId}`);
          sessionIdRef.current = newSessionId;

          if (socketRef.current) {
              socketRef.current.emit('update-session-id', newSessionId);
          }
      }

      prevStatusRef.current = timerState.status;
    }
  }, [timerState]); // Depend on full timerState to ensure fresh closure, but filter by status change

  // Initialize Audio Context
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      logger.debug('[Audio] Initializing AudioContext');
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
      logger.debug('[Audio] Resuming AudioContext');
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  const connect = useCallback(async (user?: any) => {
    try {
      logger.info('[Connection] Starting connection sequence...');
      setConnectionState(ConnectionState.CONNECTING);
      const ctx = ensureAudioContext();

      // 1. Get Microphone Stream
      logger.debug('[Audio] Requesting microphone access');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });
      streamRef.current = stream;
      logger.debug('[Audio] Microphone stream obtained');

      // Setup Input Analyser
      const source = ctx.createMediaStreamSource(stream);
      if (inputAnalyserRef.current) {
        source.connect(inputAnalyserRef.current);
      }

      // 2. Setup Socket & WebRTC
      logger.debug(`[Socket] Connecting to ${SERVER_URL}`);
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
        logger.error("Socket connection error:", err);
        setError(`Socket error: ${err.message}`);
      });

      socket.on('connect', async () => {
        logger.info('[Socket] Connected to signaling server');
        
        // Create Peer Connection
        logger.debug('[WebRTC] Creating PeerConnection');
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        peerConnectionRef.current = pc;

        // Add Local Tracks
        stream.getTracks().forEach(track => {
            logger.debug(`[WebRTC] Adding local track: ${track.kind}`);
            pc.addTrack(track, stream);
        });

        // Handle Remote Track
        pc.ontrack = (event) => {
            logger.info('[WebRTC] Received remote track');
            const remoteStream = event.streams[0] || new MediaStream([event.track]);
            
            // Create Audio Element to play (needed for WebRTC audio)
            if (!remoteAudioRef.current) {
                remoteAudioRef.current = new Audio();
                remoteAudioRef.current.autoplay = true;
            }
            remoteAudioRef.current.srcObject = remoteStream;
            
            // Connect to Output Analyser for visualization
            if (ctx.state === 'running') {
                try {
                    const remoteSource = ctx.createMediaStreamSource(remoteStream);
                    if (outputAnalyserRef.current) {
                        remoteSource.connect(outputAnalyserRef.current);
                        // Don't connect to destination here if Audio Element is playing, 
                        // otherwise we get double audio + echo.
                        // BUT, createMediaStreamSource might mute the element if not handled correctly.
                        // Usually it's better to route: remoteSource -> analyser -> destination
                        // and NOT use the Audio element for output, just for keeping the stream alive.
                        // Let's try using Web Audio for output entirely.
                        
                        remoteAudioRef.current.muted = true; // Mute element, play via Web Audio
                        outputAnalyserRef.current.connect(ctx.destination);
                    }
                } catch (e) {
                    logger.error("Error connecting remote audio", e);
                }
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                logger.debug('[WebRTC] Sending ICE candidate');
                socket.emit('ice-candidate', event.candidate);
            }
        };

        pc.onconnectionstatechange = () => {
            logger.debug(`[WebRTC] Connection state changed: ${pc.connectionState}`);
        };

        // Create Offer
        logger.debug('[WebRTC] Creating offer');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', offer);
        
        setConnectionState(ConnectionState.CONNECTED);
        playStart();
      });

      socket.on('answer', async (answer) => {
        logger.debug('[WebRTC] Received answer');
        if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(answer);
        }
      });

      socket.on('ice-candidate', async (candidate) => {
          if (peerConnectionRef.current) {
              try {
                logger.debug('[WebRTC] Received ICE candidate');
                await peerConnectionRef.current.addIceCandidate(candidate);
              } catch (e) { logger.error('Error adding ICE candidate', e); }
          }
      });

      socket.on('tool-call', (data: { name: string, args: any }) => {
        const { name, args } = data;
        logger.info('Tool Call Received:', name, args);

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
        logger.info('[Socket] Disconnected');
        setConnectionState(ConnectionState.DISCONNECTED);
        playStop();
      });

    } catch (err: any) {
      logger.error("Connection failed", err);
      setConnectionState(ConnectionState.ERROR);
      setError(err.message);
      playStop();
    }
  }, [ensureAudioContext, playStart, playStop, playPause, playResume, playBreakStart]);

  const disconnect = useCallback(() => {
    logger.info('[Connection] Disconnecting...');
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

