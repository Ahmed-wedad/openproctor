// types/proctor.ts

export interface ProctorOptions {
    onVideoFrame?: (imageData: MediaStream) => void;
    onAudioStream?: (audioStream: MediaStream) => void;
    onScreenStream?: (screenStream: MediaStream) => void;
    onTabSwitch?: () => void;
    videoElement?: HTMLVideoElement;  // Add video element for face detection
    canvasElement?: HTMLCanvasElement; // Add canvas element for drawing face boxes
    // Phase 1 (2.1/2.2): behavior monitoring
    onBehaviorViolation?: (violation: BehaviorViolation) => void;
    // Phase 2 (2.3): face analytics
    onFaceAnalytics?: (result: FaceAnalyticsResult) => void;
    // Phase 3 (2.3/3): telemetry + snapshot upload
    sessionId?: string;
    telemetryServerUrl?: string;
    // CANDIDATE graph: ACTIVE per-session signed token (after liveness) used to
    // authenticate telemetry/snapshot to the microservice. Never the shared secret.
    sessionToken?: string;
    onTelemetryError?: (error: Error) => void;
}

export interface VideoStreamHandler {
    stream: MediaStream;
    stop: () => void;
}

export interface ScreenStreamHandler {
    stream: MediaStream;
    stop: () => void;
}

// Phase 1 (2.1/2.2): behavior monitoring
export type BehaviorViolationType =
    | 'page_blur'
    | 'page_focus'
    | 'window_resize'
    | 'copy'
    | 'cut'
    | 'paste'
    | 'tab_switch';

export interface BehaviorViolation {
    type: BehaviorViolationType;
    timestamp: number;
    detail?: string;
}

// Phase 2 (2.3): face analytics
export type FaceAnalyticsIssue =
    | 'face_not_detected'
    | 'multiple_faces'
    | 'gaze_deviation'
    | 'no_movement'
    | 'excessive_movement';

export interface FaceAnalyticsResult {
    timestamp: number;
    faceCount: number;
    gazeDeviationDeg: number;   // estimated eye-gaze deviation in degrees
    headYawDeg: number;         // head pose yaw
    headPitchDeg: number;       // head pose pitch
    headRollDeg: number;        // head pose roll
    issues: FaceAnalyticsIssue[];
}

// Phase 3 (2.3/3): telemetry payload sent to the microservice
export interface TelemetryFlag {
    timestamp: number;
    issue: string;
    detail?: Record<string, unknown>;
}  
