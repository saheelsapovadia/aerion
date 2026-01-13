# Plan: Robust Audio Inactivity Detection

The previous frontend-only approach was insufficient. I will implement a robust backend-side solution that monitors the actual audio stream (both input and output) to detect silence.

### Goals
- Disconnect the session if there is no audio activity for 10 seconds.
- Monitor both:
    1.  **Incoming Audio:** From the user's microphone.
    2.  **Outgoing Audio:** From the Gemini AI response.
- "Activity" is defined as audio volume exceeding a minimal noise threshold.

### Implementation Strategy

1.  **Backend Implementation (`backend/src/server.ts`)**:
    -   Introduce a `lastActivity` timestamp for each client connection.
    -   Implement a simple RMS (Root Mean Square) volume calculation helper.
    -   **Incoming Audio:** Inside `audioSink.ondata`, calculate the volume of the incoming audio buffer. If it exceeds a threshold, update `lastActivity`.
    -   **Outgoing Audio:** Inside `geminiSession.on('audio')`, calculate the volume of the outgoing audio buffer. If it exceeds a threshold, update `lastActivity`.
    -   **Timeout Loop:** Create a `setInterval` loop (e.g., every 1 second) that checks `Date.now() - lastActivity`. If > 10 seconds, disconnect the socket.

2.  **Frontend Cleanup**:
    -   Remove the previous frontend-only timeout logic to avoid conflicts.

### Why this is better
-   **Reliability:** It measures actual audio signal, not just "connection" status.
-   **Centralized Control:** The server has the ultimate authority to close the connection, ensuring resources are freed.
-   **Full Context:** It accounts for AI speaking time, so the user isn't disconnected while listening to a long response.

### Files to Change
-   `backend/src/server.ts`
-   `hooks/useGeminiBackend.ts` (Revert/Cleanup)

### Verification
-   I will verify by starting a session, speaking briefly, and then waiting for 10 seconds to ensure the server disconnects the client.



