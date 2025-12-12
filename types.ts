export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface AudioVisualizerState {
  volume: number; // 0 to 1
  frequencyData: Uint8Array;
}

export interface AgentConfig {
  colorHigh: string;
  colorLow: string;
  speed: number;
}

export enum TimerStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  BREAK = 'BREAK',
  COMPLETED = 'COMPLETED'
}

export interface SessionConfig {
  durationMinutes: number;
  parts: number;
  breakMinutes: number;
  goal: string;
  currentPart: number;
}

export interface TimerState {
  status: TimerStatus;
  timeLeft: number; // seconds
  config: SessionConfig;
}
