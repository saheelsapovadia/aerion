export class AudioConverter {
    // Simple downsampler 48000 -> 16000 (factor 3)
    static downsample(buffer: Buffer): Buffer {
        // Assuming 16-bit PCM (2 bytes per sample)
        const inputView = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
        const outputLength = Math.floor(inputView.length / 3);
        const outputView = new Int16Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            // Simple decimation (taking every 3rd sample)
            // Better: Average of 3
            const sum = inputView[i * 3] + inputView[i * 3 + 1] + inputView[i * 3 + 2];
            outputView[i] = sum / 3;
        }
        return Buffer.from(outputView.buffer);
    }

    // Simple upsampler 24000 -> 48000 (factor 2)
    static upsample(buffer: Buffer): Buffer {
        // Assuming 16-bit PCM
        const inputView = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
        const outputLength = inputView.length * 2;
        const outputView = new Int16Array(outputLength);

        for (let i = 0; i < inputView.length; i++) {
            const sample = inputView[i];
            outputView[i * 2] = sample;
            outputView[i * 2 + 1] = sample; // Zero-order hold
        }
        return Buffer.from(outputView.buffer);
    }
}

