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

export class GeminiSession extends EventEmitter {
  private client: GoogleGenAI;
  private session: any;
  private apiKey: string;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  async connect() {
    try {
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
            console.log('Gemini Live Connection Opened');
            this.emit('connected');
          },
          onmessage: (msg: LiveServerMessage) => {
            this.handleMessage(msg);
          },
          onclose: () => {
            console.log('Gemini Live Connection Closed');
            this.emit('disconnected');
          },
          onerror: (err: any) => {
            console.error('Gemini Live Error:', err);
            this.emit('error', err);
          }
        }
      });
    } catch (error) {
      console.error('Failed to connect to Gemini Live:', error);
      this.emit('error', error);
    }
  }

  async sendAudio(pcmData: Buffer | string) {
    if (this.session) {
      try {
        // If pcmData is Buffer, convert to base64 or send as is if supported
        // The SDK usually expects an object with 'media' property
        // Depending on SDK version, it might take a specific format
        
        // Assuming sendRealtimeInput takes { media: { mimeType, data } } or similar
        // Based on frontend code: session.sendRealtimeInput({ media: pcmBlob });
        // In node we construct the object manually
        
        const data = Buffer.isBuffer(pcmData) ? pcmData.toString('base64') : pcmData;
        
        await this.session.sendRealtimeInput({
            media: {
                mimeType: "audio/pcm;rate=16000",
                data: data
            }
        });
      } catch (e) {
        console.error("Error sending audio to Gemini", e);
      }
    }
  }

  async sendToolResponse(functionResponses: any[]) {
    if (this.session) {
        await this.session.sendToolResponse({
            functionResponses
        });
    }
  }

  private handleMessage(msg: LiveServerMessage) {
    // Handle Tool Calls
    if (msg.toolCall) {
        this.emit('toolCall', msg.toolCall);
    }

    // Handle Audio Output
    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData) {
        // audioData is Base64 string
        const buffer = Buffer.from(audioData, 'base64');
        this.emit('audio', buffer);
    }
    
    if (msg.serverContent?.interrupted) {
        this.emit('interrupted');
    }
  }

  close() {
    if (this.session) {
        // this.session.close(); // If close method exists
        // Or it might just be let go
    }
  }
}

