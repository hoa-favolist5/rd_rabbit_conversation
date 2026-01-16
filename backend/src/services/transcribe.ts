import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  TranscriptResultStream,
} from "@aws-sdk/client-transcribe-streaming";
import { config } from "../config/index.js";

// Create Transcribe client
const createClient = () => {
  return new TranscribeStreamingClient({
    region: config.aws.region,
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  });
};

// Audio chunk generator for streaming
async function* audioChunkGenerator(
  audioStream: AsyncIterable<Uint8Array>
): AsyncIterable<AudioStream> {
  for await (const chunk of audioStream) {
    yield { AudioEvent: { AudioChunk: chunk } };
  }
}

export interface TranscribeResult {
  transcript: string;
  isFinal: boolean;
}

/**
 * Stream audio to AWS Transcribe and yield transcription results
 */
export async function* transcribeStream(
  audioStream: AsyncIterable<Uint8Array>
): AsyncGenerator<TranscribeResult> {
  const client = createClient();

  console.log("🎙️ Creating AWS Transcribe stream (ja-JP, PCM, 16kHz)...");

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: "ja-JP",
    MediaEncoding: "pcm",
    MediaSampleRateHertz: 16000,
    AudioStream: audioChunkGenerator(audioStream),
    // Enable partial results for real-time feedback
    EnablePartialResultsStabilization: true,
    PartialResultsStability: "medium",
  });

  try {
    const response = await client.send(command);
    console.log("🎙️ AWS Transcribe stream connected, SessionId:", response.SessionId);

    if (!response.TranscriptResultStream) {
      throw new Error("No transcript stream returned");
    }

    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          if (result.Alternatives && result.Alternatives.length > 0) {
            const transcript = result.Alternatives[0].Transcript || "";
            if (transcript) {
              yield {
                transcript,
                isFinal: !result.IsPartial,
              };
            }
          }
        }
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Transcribe error:", errorMessage);
    
    // Check for common errors
    if (errorMessage.includes("Credentials")) {
      console.error("⚠️ AWS credentials may be missing or invalid. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
    } else if (errorMessage.includes("region")) {
      console.error("⚠️ AWS region may be incorrect. Check AWS_REGION");
    }
    
    throw error;
  } finally {
    client.destroy();
  }
}

/**
 * Simple transcription from a complete audio buffer
 * (for non-streaming use cases)
 */
export async function transcribeAudio(
  audioBuffer: Uint8Array
): Promise<string> {
  const chunks = [audioBuffer];
  
  async function* audioIterator() {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  let finalTranscript = "";

  for await (const result of transcribeStream(audioIterator())) {
    if (result.isFinal) {
      finalTranscript += result.transcript;
    }
  }

  return finalTranscript;
}

/**
 * AudioBuffer class to accumulate audio chunks for streaming
 */
export class AudioBuffer {
  private chunks: Uint8Array[] = [];
  private resolvers: Array<(value: Uint8Array | null) => void> = [];
  private closed = false;

  push(chunk: Uint8Array): void {
    if (this.closed) return;

    if (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver(chunk);
    } else {
      this.chunks.push(chunk);
    }
  }

  close(): void {
    this.closed = true;
    // Resolve any pending reads with null
    for (const resolver of this.resolvers) {
      resolver(null);
    }
    this.resolvers = [];
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    while (true) {
      if (this.chunks.length > 0) {
        yield this.chunks.shift()!;
      } else if (this.closed) {
        return;
      } else {
        const chunk = await new Promise<Uint8Array | null>((resolve) => {
          this.resolvers.push(resolve);
        });
        if (chunk === null) return;
        yield chunk;
      }
    }
  }
}
