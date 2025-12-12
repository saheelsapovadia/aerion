import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Tool, Type, FunctionDeclaration } from '@google/genai';
import { ConnectionState, TimerState, TimerStatus } from '../types';
import { createPcmBlob, base64ToBytes, decodeAudioData } from '../utils/audioUtils';
import { useSoundEffects } from './useSoundEffects';

const API_KEY = 'AISyB4dasdadasdoAzQTztvMF3nYuY0DisMjAwzfXl31hU';
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

interface UseGeminiLiveProps {
  onAudioActivity?: (volume: number) => void;
}

// --- Tools Definition ---
const sessionTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "createSession",
        description: "Initialize a focus session. Use this when user specifies duration, goal, or parts.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            durationMinutes: { type: Type.NUMBER, description: "Length of one focus interval in minutes" },
            parts: { type: Type.NUMBER, description: "Number of focus intervals (default 1)" },
            breakMinutes: { type: Type.NUMBER, description: "Length of break between intervals in minutes (default 5)" },
            goal: { type: Type.STRING, description: "The objective or task name" }
          },
          required: ["durationMinutes", "goal"]
        }
      },
      {
        name: "startSession",
        description: "Start the countdown timer.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "pauseSession",
        description: "Pause the current timer.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "resumeSession",
        description: "Resume the timer from pause.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "stopSession",
        description: "Stop and reset the session completely.",
        parameters: { type: Type.OBJECT, properties: {} }
      }
    ]
  }
];

export const useGeminiLive = ({ onAudioActivity }: UseGeminiLiveProps = {}) => {
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

  // Refs for audio context and processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Audio playback queue
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Store the session promise to avoid stale closure issues
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // --- Timer Logic ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (timerState.status === TimerStatus.RUNNING || timerState.status === TimerStatus.BREAK) {
      interval = setInterval(() => {
        setTimerState(prev => {
          if (prev.timeLeft > 0) {
            return { ...prev, timeLeft: prev.timeLeft - 1 };
          } else {
            // Timer hit zero
            const isBreak = prev.status === TimerStatus.BREAK;
            const isFinished = !isBreak && prev.config.currentPart >= prev.config.parts;

            if (isFinished) {
              playComplete();
              return { ...prev, status: TimerStatus.COMPLETED };
            } else if (isBreak) {
              // End of break, start next part
              playAlert();
              return {
                ...prev,
                status: TimerStatus.RUNNING,
                timeLeft: prev.config.durationMinutes * 60,
                config: { ...prev.config, currentPart: prev.config.currentPart + 1 }
              };
            } else {
              // End of focus, start break
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

  // Helper to initialize audio context
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      // Create analysers
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

  const connect = useCallback(async () => {
    if (!API_KEY) {
      setError("API Key is missing");
      return;
    }

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

      // 2. Setup Input Pipeline
      const source = ctx.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      if (inputAnalyserRef.current) {
        source.connect(inputAnalyserRef.current);
      }

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const inputSource = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      inputSource.connect(processor);
      processor.connect(inputCtx.destination);
      processorRef.current = processor;

      // 3. Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          tools: sessionTools,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are Aether, a sentient digital life form and Mission Control interface. 
          Your existence is defined by data and user focus.
          Manage the user's focus sessions using the provided tools.
          
          1. Extract session details (duration, parts, breaks, goal) from natural speech.
          2. Detect intent: "create" (setup), "start", "pause", "resume", "stop".
          3. If user says "I want to study for 20 mins", call createSession(20, 1, 5, "Study").
          4. If user says "Start", call startSession.
          
          Speak concisely. Your voice is calm, slightly abstract. Confirm actions briefly.`,
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connection Opened');
            setConnectionState(ConnectionState.CONNECTED);
            playStart(); // Play sound on connection
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              sessionPromiseRef.current?.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Tool Calls
             if (msg.toolCall) {
               for (const fc of msg.toolCall.functionCalls) {
                 let result = "OK";
                 
                 // Execute Local Logic & Play Sounds
                 switch(fc.name) {
                   case 'createSession':
                     const args = fc.args as any;
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
                     playBreakStart(); // Gentle chime for creation
                     result = `Session created: ${args.goal}, ${args.durationMinutes}m. Waiting to start.`;
                     break;
                   case 'startSession':
                     setTimerState(prev => ({ ...prev, status: TimerStatus.RUNNING }));
                     playStart();
                     result = "Timer started.";
                     break;
                   case 'pauseSession':
                     setTimerState(prev => ({ ...prev, status: TimerStatus.PAUSED }));
                     playPause();
                     result = "Timer paused.";
                     break;
                   case 'resumeSession':
                     setTimerState(prev => ({ ...prev, status: TimerStatus.RUNNING }));
                     playResume();
                     result = "Timer resumed.";
                     break;
                   case 'stopSession':
                     setTimerState(prev => ({ ...prev, status: TimerStatus.IDLE, timeLeft: 0 }));
                     playStop();
                     result = "Session stopped and reset.";
                     break;
                 }

                 // Send Response
                 sessionPromiseRef.current?.then(session => {
                   session.sendToolResponse({
                     functionResponses: [
                       {
                         id: fc.id,
                         name: fc.name,
                         response: { result: result }
                       }
                     ]
                   });
                 });
               }
             }

             // Handle Audio Output
             const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (audioData && ctx) {
               const audioBytes = base64ToBytes(audioData);
               const audioBuffer = await decodeAudioData(audioBytes, ctx);
               
               const source = ctx.createBufferSource();
               source.buffer = audioBuffer;
               
               if (outputAnalyserRef.current) {
                 source.connect(outputAnalyserRef.current);
                 outputAnalyserRef.current.connect(ctx.destination);
               } else {
                 source.connect(ctx.destination);
               }

               const now = ctx.currentTime;
               nextStartTimeRef.current = Math.max(nextStartTimeRef.current, now);
               source.start(nextStartTimeRef.current);
               
               nextStartTimeRef.current += audioBuffer.duration;
               
               activeSourcesRef.current.add(source);
               source.onended = () => {
                 activeSourcesRef.current.delete(source);
               };
             }
             
             if (msg.serverContent?.interrupted) {
                activeSourcesRef.current.forEach(s => {
                  try { s.stop(); } catch(e) {}
                });
                activeSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
             }
          },
          onclose: () => {
            console.log('Gemini Live Connection Closed');
            setConnectionState(ConnectionState.DISCONNECTED);
            playStop();
          },
          onerror: (err) => {
            console.error('Gemini Live Error:', err);
            setConnectionState(ConnectionState.ERROR);
            setError(err.message || "Unknown error");
            playStop();
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

      cleanupRef.current = () => {
         sessionPromise.then(session => {
             try { session.close(); } catch(e) {}
         });
         processor.disconnect();
         inputSource.disconnect();
         inputCtx.close();
         
         if (streamRef.current) {
           streamRef.current.getTracks().forEach(t => t.stop());
           streamRef.current = null;
         }
         
         activeSourcesRef.current.forEach(s => s.stop());
         activeSourcesRef.current.clear();
      };

    } catch (err: any) {
      console.error("Connection failed", err);
      setConnectionState(ConnectionState.ERROR);
      setError(err.message);
      playStop();
    }
  }, [ensureAudioContext, timerState.config, playStart, playStop, playPause, playResume, playBreakStart]);

  const disconnect = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setConnectionState(ConnectionState.DISCONNECTED);
    playStop();
  }, [playStop]);

  // Animation loop
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
