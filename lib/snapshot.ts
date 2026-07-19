// lib/snapshot.ts
// Phase 3 (3): Periodically capture a snapshot from the video/canvas and upload it
// to the microservice, which stores it in object storage (MinIO) for later review.

export interface SnapshotClientOptions {
    sessionId: string;
    serverUrl: string;          // base URL of the microservice
    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;  // overlay canvas used to grab the frame
    intervalMs?: number;        // snapshot cadence (default 60000ms = 1 min)
    onError?: (error: Error) => void;
}

export class SnapshotClient {
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly endpoint: string;

    constructor(private options: SnapshotClientOptions) {
        this.endpoint = `${options.serverUrl.replace(/\/$/, '')}/api/snapshot`;
    }

    public start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.capture(), this.options.intervalMs ?? 60000);
    }

    public stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    private async capture(): Promise<void> {
        const { video, canvas, sessionId } = this.options;
        if (video.readyState < 2) return;
        try {
            const blob: Blob = await new Promise((resolve, reject) => {
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.8);
            });
            const formData = new FormData();
            formData.append('file', blob, `snapshot-${Date.now()}.jpg`);
            formData.append('sessionId', sessionId);
            formData.append('timestamp', String(Date.now()));

            const res = await fetch(this.endpoint, { method: 'POST', body: formData });
            if (!res.ok) throw new Error(`Snapshot upload failed: ${res.status} ${res.statusText}`);
        } catch (err) {
            this.options.onError?.(err as Error);
        }
    }
}
