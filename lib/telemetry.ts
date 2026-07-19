// lib/telemetry.ts
// Phase 3 (2.3 / 3): Client that sends lightweight telemetry flags to the microservice.
// Flags are batched and flushed on an interval or when the buffer reaches a threshold.
import { TelemetryFlag } from '../types/proctor';

export interface TelemetryClientOptions {
    sessionId: string;
    serverUrl: string;          // base URL of the microservice (e.g. http://localhost:4000)
    batchSize?: number;         // flush when buffer reaches this size (default 10)
    flushIntervalMs?: number;   // periodic flush interval (default 2000ms)
    onError?: (error: Error) => void;
}

export class TelemetryClient {
    private buffer: TelemetryFlag[] = [];
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly batchSize: number;
    private readonly flushIntervalMs: number;
    private readonly endpoint: string;
    private flushing = false;

    constructor(private options: TelemetryClientOptions) {
        this.batchSize = options.batchSize ?? 10;
        this.flushIntervalMs = options.flushIntervalMs ?? 2000;
        this.endpoint = `${options.serverUrl.replace(/\/$/, '')}/api/telemetry`;
        this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
    }

    public send(flag: TelemetryFlag): void {
        this.buffer.push(flag);
        if (this.buffer.length >= this.batchSize) {
            void this.flush();
        }
    }

    public async flush(): Promise<void> {
        if (this.flushing || this.buffer.length === 0) return;
        this.flushing = true;
        const batch = this.buffer.splice(0, this.buffer.length);
        try {
            const res = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.options.sessionId, flags: batch }),
            });
            if (!res.ok) {
                throw new Error(`Telemetry upload failed: ${res.status} ${res.statusText}`);
            }
        } catch (err) {
            // Re-queue on failure so data is not lost.
            this.buffer = batch.concat(this.buffer);
            this.options.onError?.(err as Error);
        } finally {
            this.flushing = false;
        }
    }

    public dispose(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}
