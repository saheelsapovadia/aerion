import { useCallback, useRef } from 'react';

export const useSoundEffects = () => {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const createOscillator = (ctx: AudioContext, type: OscillatorType, freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    return { osc, gain };
  };

  const playStart = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Rising sweep (Power up)
    const { osc, gain } = createOscillator(ctx, 'sine', 200, now, 0.6);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.start(now);
    osc.stop(now + 0.6);

    // Secondary harmonic
    const { osc: osc2, gain: gain2 } = createOscillator(ctx, 'triangle', 400, now, 0.6);
    osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.4);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc2.start(now);
    osc2.stop(now + 0.6);
  }, [getCtx]);

  const playStop = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Quick collapse (Power down)
    const { osc, gain } = createOscillator(ctx, 'sawtooth', 150, now, 0.3);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  }, [getCtx]);

  const playPause = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Resonant ping down
    const { osc, gain } = createOscillator(ctx, 'sine', 600, now, 0.4);
    osc.frequency.linearRampToValueAtTime(300, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }, [getCtx]);

  const playResume = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Resonant ping up
    const { osc, gain } = createOscillator(ctx, 'sine', 300, now, 0.4);
    osc.frequency.linearRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }, [getCtx]);

  const playComplete = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Grand Finale Chord (C Major 9: C, E, G, B, D)
    const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66]; // C5, E5, G5, B5, D6
    
    // Main chord swell
    freqs.forEach((f, i) => {
      const delay = i * 0.08;
      // Use mixed waveforms for richer sound
      const type = i % 2 === 0 ? 'sine' : 'triangle';
      const { osc, gain } = createOscillator(ctx, type, f, now + delay, 4.0);
      
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.3); // Slower attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 3.5); // Longer decay
      
      osc.start(now + delay);
      osc.stop(now + delay + 4.0);
    });
    
    // High shimmer / bell layer
    const bells = [2093.00, 2637.02]; // C7, E7
    bells.forEach((f, i) => {
        const delay = 0.5 + (i * 0.2);
        const { osc, gain } = createOscillator(ctx, 'sine', f, now + delay, 2.0);
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.08, now + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 1.5);
        osc.start(now + delay);
        osc.stop(now + delay + 2.0);
    });

    // Deep bass root
    const { osc: bass, gain: bassGain } = createOscillator(ctx, 'triangle', 130.81, now, 3.0); // C3
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.3, now + 0.5);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
    bass.start(now);
    bass.stop(now + 3.0);

  }, [getCtx]);

  const playBreakStart = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Gentle double chime
    [440, 554.37].forEach((f, i) => { // A4, C#5
      const t = now + i * 0.2;
      const { osc, gain } = createOscillator(ctx, 'sine', f, t, 1.0);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.start(t);
      osc.stop(t + 1.0);
    });
  }, [getCtx]);
  
  const playAlert = useCallback(() => {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Urgent pulsing
    const { osc, gain } = createOscillator(ctx, 'square', 880, now, 0.6);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.setValueAtTime(0.05, now + 0.1);
    gain.gain.setValueAtTime(0, now + 0.11);
    gain.gain.setValueAtTime(0.05, now + 0.2);
    gain.gain.setValueAtTime(0, now + 0.21);
    gain.gain.setValueAtTime(0.05, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    
    // Low pass filter to soften the square wave
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;
    
    osc.disconnect();
    osc.connect(filter);
    filter.connect(gain);
    
    osc.start(now);
    osc.stop(now + 0.6);
  }, [getCtx]);

  return {
    playStart,
    playStop,
    playPause,
    playResume,
    playComplete,
    playBreakStart,
    playAlert
  };
};
