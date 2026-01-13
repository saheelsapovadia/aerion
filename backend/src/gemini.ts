import { GoogleGenAI, LiveServerMessage, Modality, Tool, Type } from '@google/genai';
import { EventEmitter } from 'events';
import { SYSTEM_INSTRUCTION } from './guardrails';

const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Define Tools
export const sessionTools: Tool[] = [
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

// Helper for backend logging
const logger = {
    debug: (msg: string, ...args: any[]) => console.debug(`[DEBUG] ${msg}`, ...args),
    info: (msg: string, ...args: any[]) => console.info(`[INFO] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
};

export class GeminiSession extends EventEmitter {
  private client: GoogleGenAI;
  private session: any;
  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    logger.info(`GeminiSession initialized with API key length: ${apiKey?.length}`);
  }

  async connect() {
    try {
      logger.info(`Connecting to Gemini Live (Model: ${MODEL_NAME})...`);
      this.session = await this.client.live.connect({
        model: MODEL_NAME,
        config: {
          tools: sessionTools,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            logger.info('Gemini Live Connection Opened');
            this.emit('connected');
          },
          onmessage: (msg: LiveServerMessage) => {
            // logger.debug('Gemini Message received');
            this.handleMessage(msg);
          },
          onclose: () => {
            logger.info('Gemini Live Connection Closed');
            this.emit('disconnected');
          },
          onerror: (err: any) => {
            logger.error('Gemini Live Error:', err);
            this.emit('error', err);
          }
        }
      });
      logger.info('Gemini Live connection established');
    } catch (error) {
      logger.error('Failed to connect to Gemini Live:', error);
      this.emit('error', error);
    }
  }

  async sendAudio(pcmData: Buffer | string) {
    if (this.session) {
      try {
        const data = Buffer.isBuffer(pcmData) ? pcmData.toString('base64') : pcmData;
        // logger.debug(`Sending ${data.length} bytes of audio to Gemini`);
        
        await this.session.sendRealtimeInput({
            media: {
                mimeType: "audio/pcm;rate=16000",
                data: data
            }
        });
      } catch (e) {
        logger.error("Error sending audio to Gemini", e);
      }
    } else {
        // Suppress warning if just starting up, or maybe just log once
        // logger.warn("Attempted to send audio but session is not active");
    }
  }

  async sendToolResponse(functionResponses: any[]) {
    if (this.session) {
        logger.info('Sending tool response to Gemini:', functionResponses);
        await this.session.sendToolResponse({
            functionResponses
        });
    } else {
        logger.warn("Attempted to send tool response but session is not active");
    }
  }

  private handleMessage(msg: LiveServerMessage) {
    // Handle Tool Calls
    if (msg.toolCall) {
        logger.info('Received tool call from Gemini:', msg.toolCall);
        this.emit('toolCall', msg.toolCall);
    }

    // Handle Audio Output
    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
        // audioData is Base64 string
        // logger.debug('Received audio response from Gemini');
        const buffer = Buffer.from(audioData, 'base64');
        this.emit('audio', buffer);
    }
    
    if (msg.serverContent?.interrupted) {
        logger.info('Gemini output interrupted');
        this.emit('interrupted');
    }
    
    if (msg.serverContent?.turnComplete) {
        logger.debug('Gemini turn complete');
    }
  }

  close() {
    if (this.session) {
        logger.info("Closing Gemini session");
        // this.session.close(); // If close method exists
        // Or it might just be let go
    }
  }
}

