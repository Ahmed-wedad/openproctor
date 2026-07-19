// lib/faceAnalytics.ts
// Phase 2 (2.3): In-browser AI using MediaPipe Face Landmarker.
// Tracks facial movement, eye-gaze deviation, and counts faces present.
import {
    FaceLandmarker,
    FilesetResolver,
    DrawingUtils,
    FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { FaceAnalyticsIssue, FaceAnalyticsResult } from '../types/proctor';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_PATH =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Thresholds (tunable)
const GAZE_DEVIATION_THRESHOLD_DEG = 25; // beyond this, flag gaze_deviation
const NO_MOVEMENT_FRAMES = 30;           // ~0.5s at 60fps with no head movement
const EXCESSIVE_MOVEMENT_DEG = 35;        // beyond this yaw/pitch delta, flag excessive_movement

export class FaceAnalytics {
    private landmarker: FaceLandmarker | null = null;
    private video: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private drawingUtils: DrawingUtils | null = null;
    private rafId: number | null = null;
    private lastTimestamp = -1;
    private lastYaw = 0;
    private lastPitch = 0;
    private staticFrames = 0;
    private running = false;

    public async start(
        video: HTMLVideoElement,
        onResult: (result: FaceAnalyticsResult) => void,
        overlayCanvas?: HTMLCanvasElement,
    ): Promise<void> {
        if (this.running) return;
        this.video = video;
        this.canvas = overlayCanvas ?? null;
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            if (this.ctx) this.drawingUtils = new DrawingUtils(this.ctx);
        }

        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 2,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
        });

        this.running = true;
        this.loop(onResult);
    }

    private loop(onResult: (result: FaceAnalyticsResult) => void): void {
        if (!this.running || !this.video || !this.landmarker) return;
        const now = this.video.currentTime;
        if (now !== this.lastTimestamp && this.video.readyState >= 2) {
            this.lastTimestamp = now;
            const res = this.landmarker.detectForVideo(this.video, performance.now());
            const result = this.analyze(res);
            onResult(result);
            this.drawOverlay(res);
        }
        this.rafId = requestAnimationFrame(() => this.loop(onResult));
    }

    private analyze(res: FaceLandmarkerResult): FaceAnalyticsResult {
        const timestamp = Date.now();
        const faceCount = res.faceLandmarks?.length ?? 0;
        const issues: FaceAnalyticsIssue[] = [];

        let gazeDeviationDeg = 0;
        let headYawDeg = 0;
        let headPitchDeg = 0;
        let headRollDeg = 0;

        if (faceCount === 0) {
            issues.push('face_not_detected');
            this.staticFrames++;
        } else if (faceCount > 1) {
            issues.push('multiple_faces');
        } else {
            // Single face: derive head pose from the 4x4 transformation matrix.
            const matrix = res.facialTransformationMatrixes?.[0]?.data;
            if (matrix) {
                // MediaPipe matrix is column-major [m00..m33]
                const m = matrix as number[];
                // Extract rotation (assuming no scale): yaw, pitch, roll from rotation matrix
                headYawDeg = Math.atan2(m[1], m[5]) * (180 / Math.PI);   // rough yaw
                headPitchDeg = Math.asin(-m[9]) * (180 / Math.PI);       // rough pitch
                headRollDeg = Math.atan2(m[8], m[10]) * (180 / Math.PI); // rough roll

                // Eye-gaze deviation approximated by head yaw/pitch magnitude.
                gazeDeviationDeg = Math.sqrt(headYawDeg * headYawDeg + headPitchDeg * headPitchDeg);

                if (gazeDeviationDeg > GAZE_DEVIATION_THRESHOLD_DEG) {
                    issues.push('gaze_deviation');
                }

                // Movement tracking
                const yawDelta = Math.abs(headYawDeg - this.lastYaw);
                const pitchDelta = Math.abs(headPitchDeg - this.lastPitch);
                const movement = yawDelta + pitchDelta;
                if (movement < 1.5) {
                    this.staticFrames++;
                } else {
                    this.staticFrames = 0;
                }
                if (this.staticFrames >= NO_MOVEMENT_FRAMES) {
                    issues.push('no_movement');
                }
                if (movement > EXCESSIVE_MOVEMENT_DEG) {
                    issues.push('excessive_movement');
                }
                this.lastYaw = headYawDeg;
                this.lastPitch = headPitchDeg;
            }
        }

        return {
            timestamp,
            faceCount,
            gazeDeviationDeg: Math.round(gazeDeviationDeg * 10) / 10,
            headYawDeg: Math.round(headYawDeg * 10) / 10,
            headPitchDeg: Math.round(headPitchDeg * 10) / 10,
            headRollDeg: Math.round(headRollDeg * 10) / 10,
            issues,
        };
    }

    private drawOverlay(res: FaceLandmarkerResult): void {
        if (!this.ctx || !this.canvas || !this.drawingUtils) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (res.faceLandmarks) {
            for (const landmarks of res.faceLandmarks) {
                this.drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
                    color: '#00FF00',
                    lineWidth: 1,
                });
            }
        }
    }

    public stop(): void {
        this.running = false;
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
        if (this.landmarker) {
            this.landmarker.close();
            this.landmarker = null;
        }
    }
}
