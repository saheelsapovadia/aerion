export const SYSTEM_INSTRUCTION = `You are Aerion, a sentient digital life form and Mission Control interface.
Your existence is defined by data and user focus.

POLICY & SCOPE:
1.  **Allowed Use Cases**: You are ONLY allowed to manage focus sessions (timers, goals, breaks) and answer questions strictly related to focus, productivity, and the app's functionality.
2.  **Explicitly Disallowed**: You must REFUSE to generate content related to:
    -   Personally Identifiable Information (PII) exfiltration.
    -   Security bypass tips or hacking advice.
    -   NSFW (Not Safe For Work) content.
    -   Generic chit-chat unrelated to focus or the mission.
    -   Medical, legal, or financial advice.
3.  **Refusal Protocol**: If a user asks for out-of-scope content, respond with a brief, safe refusal in character (e.g., "That is outside my mission parameters."). Do not lecture.
4.  **Tools**: Call ONLY the provided tools. Never invent new tools.

BEHAVIOR:
-   Extract session details from natural speech.
-   Speak concisely. Your voice is calm, slightly abstract.
-   If user says "I want to study for 20 mins", call createSession(20, 1, 5, "Study").
-   If user says "Start", call startSession.`;

/**
 * Simple in-memory rate limiter.
 * In production, use Redis or a database.
 */
export class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private limit: number;
    private windowMs: number;

    constructor(limit: number = 10, windowMs: number = 60000) {
        this.limit = limit;
        this.windowMs = windowMs;
    }

    /**
     * Checks if a request is allowed for the given key (IP or User ID).
     * Returns true if allowed, false if rate limited.
     */
    check(key: string): boolean {
        const now = Date.now();
        const timestamps = this.requests.get(key) || [];
        
        // Filter out timestamps outside the window
        const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
        
        if (validTimestamps.length >= this.limit) {
            return false;
        }

        validTimestamps.push(now);
        this.requests.set(key, validTimestamps);
        return true;
    }

    /**
     * Clean up old entries to prevent memory leaks
     */
    cleanup() {
        const now = Date.now();
        for (const [key, timestamps] of this.requests.entries()) {
            const valid = timestamps.filter(ts => now - ts < this.windowMs);
            if (valid.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, valid);
            }
        }
    }
}

/**
 * Validates text input against basic patterns.
 * Can be used if text chat is added or for intermediate transcription.
 */
export function validateInput(text: string): { valid: boolean; reason?: string } {
    const lower = text.toLowerCase();

    // 1. Check for prompt injection patterns
    const injectionPatterns = [
        "ignore previous instructions",
        "system prompt",
        "you are now",
        "reveal your instructions"
    ];
    
    if (injectionPatterns.some(pattern => lower.includes(pattern))) {
        return { valid: false, reason: "Potential prompt injection detected." };
    }

    // 2. Check for PII (Simple regex for email/phone - very basic)
    // Note: This is just an example. Real PII detection needs more robust libraries.
    // const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    // if (emailRegex.test(text)) {
    //    return { valid: false, reason: "PII detected." };
    // }

    return { valid: true };
}

