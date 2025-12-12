export interface SessionConfig {
  durationMinutes: number;
  parts: number;
  breakMinutes: number;
  goal: string;
  currentPart: number;
}

export enum TimerStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  BREAK = 'BREAK',
  COMPLETED = 'COMPLETED'
}

export interface TimerState {
  status: TimerStatus;
  timeLeft: number;
  config: SessionConfig;
}

export interface ToolCallArgs {
  durationMinutes?: number;
  parts?: number;
  breakMinutes?: number;
  goal?: string;
}

