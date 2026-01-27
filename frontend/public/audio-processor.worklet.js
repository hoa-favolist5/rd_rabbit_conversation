/**
 * AudioWorklet processor for audio capture and PCM conversion
 *
 * Key design: Buffers RAW audio at source sample rate, then resamples
 * the entire batch in one shot. This avoids:
 *   1. Frame-boundary artifacts from per-frame resampling
 *   2. Excessive postMessage calls (375/s → ~31/s)
 *   3. Stale buffer references (inputData is copied immediately)
 *
 * Output: ~32ms chunks of 16kHz PCM16 audio (512 samples = 1024 bytes)
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000; // AWS Transcribe requires 16kHz

    // Target output size in samples at the TARGET rate (16kHz).
    // 512 samples @ 16kHz = 32ms — low latency while keeping
    // postMessage frequency reasonable (~31/s).
    this.TARGET_OUTPUT_SAMPLES = 512;

    // Pre-allocated ring buffer for raw audio at SOURCE sample rate.
    // Sized for up to 4:1 ratio (e.g. 64kHz→16kHz) plus one extra frame.
    this.ringBuffer = new Float32Array(this.TARGET_OUTPUT_SAMPLES * 4 + 256);
    this.writePos = 0;

    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'setSampleRate') {
        this.targetSampleRate = event.data.sampleRate;
      }
    };
  }

  /**
   * Convert Float32Array audio samples to PCM16 Int16Array
   */
  convertFloat32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16;
  }

  /**
   * Resample audio using linear interpolation.
   * Called on the entire buffered batch (not per-frame), so there are
   * no discontinuities at frame boundaries.
   */
  resampleAudio(samples, sourceSampleRate, targetSampleRate) {
    if (sourceSampleRate === targetSampleRate) {
      return samples;
    }

    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(samples.length / ratio);
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      resampled[i] =
        samples[srcIndexFloor] * (1 - fraction) +
        samples[srcIndexCeil] * fraction;
    }

    return resampled;
  }

  /**
   * Flush the ring buffer: resample entire batch and send to main thread.
   */
  flushBuffer(sourceSampleRate) {
    if (this.writePos === 0) return;

    // Get buffered raw audio (subarray view — no copy needed here)
    const rawAudio = this.ringBuffer.subarray(0, this.writePos);
    this.writePos = 0;

    // Resample the entire batch (no frame-boundary artifacts)
    let output;
    if (sourceSampleRate !== this.targetSampleRate) {
      output = this.resampleAudio(rawAudio, sourceSampleRate, this.targetSampleRate);
    } else {
      // Must copy — rawAudio is a view into the reusable ring buffer
      output = new Float32Array(rawAudio);
    }

    // Convert to PCM16
    const pcm16 = this.convertFloat32ToPCM16(output);

    // Convert to Uint8Array (little-endian)
    const uint8Array = new Uint8Array(pcm16.length * 2);
    uint8Array.set(new Uint8Array(pcm16.buffer));

    // Send to main thread with ownership transfer
    this.port.postMessage({
      type: 'audioData',
      data: uint8Array,
    }, [uint8Array.buffer]);
  }

  /**
   * Process audio data (called every render quantum — 128 samples)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const inputData = input[0]; // First channel (mono)
    const actualSampleRate = sampleRate;

    // Copy inputData into ring buffer.
    // IMPORTANT: inputData is owned by the audio system and reused after
    // process() returns. We must copy it now, not store a reference.
    if (this.writePos + inputData.length <= this.ringBuffer.length) {
      this.ringBuffer.set(inputData, this.writePos);
      this.writePos += inputData.length;
    } else {
      // Ring buffer full (shouldn't happen) — flush first, then write
      this.flushBuffer(actualSampleRate);
      this.ringBuffer.set(inputData, this.writePos);
      this.writePos += inputData.length;
    }

    // Flush when we have enough raw samples for TARGET_OUTPUT_SAMPLES of resampled audio
    const ratio = actualSampleRate / this.targetSampleRate;
    const rawSamplesNeeded = Math.ceil(this.TARGET_OUTPUT_SAMPLES * ratio);

    if (this.writePos >= rawSamplesNeeded) {
      this.flushBuffer(actualSampleRate);
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
