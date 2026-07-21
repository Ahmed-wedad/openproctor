// lib/index.ts
import { initCamera } from './camera';
import { initMicrophone, stopMicrophone } from './microphone';
import { initScreenShare } from './screenshare';
import { detectTabSwitch } from './tabswitch';
import { FaceDetection } from './faceDetection';
import { BehaviorMonitor } from './behaviorMonitor';
import { FaceAnalytics } from './faceAnalytics';
import { TelemetryClient } from './telemetry';
import { SnapshotClient } from './snapshot';
import { ProctorOptions, VideoStreamHandler, ScreenStreamHandler } from '../types/proctor';

export class Proctor {
    private static videoHandler?: VideoStreamHandler;
    private static screenHandler?: ScreenStreamHandler;
    private static microphoneStream?: MediaStream;
    private static faceDetection: FaceDetection = new FaceDetection();
    private static behaviorMonitor?: BehaviorMonitor;
    private static faceAnalytics: FaceAnalytics = new FaceAnalytics();
    private static telemetryClient?: TelemetryClient;
    private static snapshotClient?: SnapshotClient;

    // Static setup method to initialize camera, microphone, screen share, and tab switch detection
    public static setup(options: ProctorOptions) {
        // Initialize camera if the video callback is provided
        if (options.onVideoFrame) {
            initCamera()
                .then(async handler => {
                    Proctor.videoHandler = handler;
                    if (options.onVideoFrame) {
                        options.onVideoFrame(handler.stream);
                    }

                    // Load the face detection model and start face detection
                    await Proctor.faceDetection.loadModel();
                    if (options.videoElement && options.canvasElement) {
                        Proctor.faceDetection.detectFaces(options.videoElement, options.canvasElement);
                    }
                })
                .catch(error => {
                    console.error('Error initializing camera:', error);
                });
        }

        // Initialize microphone if the audio callback is provided
        if (options.onAudioStream) {
            initMicrophone()
                .then(stream => {
                    Proctor.microphoneStream = stream;
                    if (options.onAudioStream) {
                        options.onAudioStream(stream);
                    }
                })
                .catch(error => {
                    console.error('Error initializing microphone:', error);
                });
        }

        // Initialize screen sharing if the screen callback is provided
        if (options.onScreenStream) {
            initScreenShare()
                .then(handler => {
                    Proctor.screenHandler = handler;
                    if (options.onScreenStream) {
                        options.onScreenStream(handler.stream);
                    }
                })
                .catch(error => {
                    console.error('Error initializing screen sharing:', error);
                });
        }

        // Detect tab switch if the callback is provided
        if (options.onTabSwitch) {
            detectTabSwitch(options.onTabSwitch);
        }

        // Phase 1 (2.1/2.2): behavior monitoring
        if (options.onBehaviorViolation) {
            Proctor.behaviorMonitor = new BehaviorMonitor(options.onBehaviorViolation);
            Proctor.behaviorMonitor.start();
        }

        // Phase 3 (2.3/3): telemetry client
        if (options.sessionId && options.telemetryServerUrl) {
            Proctor.telemetryClient = new TelemetryClient({
                sessionId: options.sessionId,
                serverUrl: options.telemetryServerUrl,
                // CANDIDATE graph: pass the ACTIVE sessionToken so telemetry is authenticated.
                sessionToken: options.sessionToken,
                onError: options.onTelemetryError,
            });
        }

        // Phase 2 (2.3): face analytics (runs alongside the BlazeFace overlay)
        if (options.onFaceAnalytics && options.videoElement) {
            Proctor.faceAnalytics.start(options.videoElement, (result) => {
                options.onFaceAnalytics?.(result);
                // Forward analytics issues as telemetry flags
                if (Proctor.telemetryClient && result.issues.length > 0) {
                    for (const issue of result.issues) {
                        Proctor.telemetryClient.send({
                            timestamp: result.timestamp,
                            issue,
                            detail: {
                                faceCount: result.faceCount,
                                gazeDeviationDeg: result.gazeDeviationDeg,
                                headYawDeg: result.headYawDeg,
                                headPitchDeg: result.headPitchDeg,
                                headRollDeg: result.headRollDeg,
                            },
                        });
                    }
                }
            }, options.canvasElement);
        }

        // Phase 3 (3): periodic snapshot capture -> object storage
        if (options.sessionId && options.telemetryServerUrl && options.videoElement && options.canvasElement) {
            Proctor.snapshotClient = new SnapshotClient({
                sessionId: options.sessionId,
                serverUrl: options.telemetryServerUrl,
                video: options.videoElement,
                canvas: options.canvasElement,
                onError: options.onTelemetryError,
            });
            Proctor.snapshotClient.start();
        }
    }

    // Stop camera stream
    public static stopCamera() {
        if (Proctor.videoHandler) {
            Proctor.videoHandler.stop();
        }
    }

    // Stop microphone stream
    public static stopMicrophone() {
        if (Proctor.microphoneStream) {
            stopMicrophone(Proctor.microphoneStream);
        }
    }

    // Stop screen sharing stream
    public static stopScreenShare() {
        if (Proctor.screenHandler) {
            Proctor.screenHandler.stop();
        }
    }

    // Stop behavior monitoring
    public static stopBehaviorMonitor() {
        if (Proctor.behaviorMonitor) {
            Proctor.behaviorMonitor.stop();
            Proctor.behaviorMonitor = undefined;
        }
    }

    // Stop face analytics loop
    public static stopFaceAnalytics() {
        Proctor.faceAnalytics.stop();
    }

    // Flush and stop the telemetry client
    public static async stopTelemetry(): Promise<void> {
        if (Proctor.telemetryClient) {
            await Proctor.telemetryClient.flush();
            Proctor.telemetryClient.dispose();
            Proctor.telemetryClient = undefined;
        }
        if (Proctor.snapshotClient) {
            Proctor.snapshotClient.stop();
            Proctor.snapshotClient = undefined;
        }
    }

    // Stop everything
    public static async stop() {
        Proctor.stopCamera();
        Proctor.stopMicrophone();
        Proctor.stopScreenShare();
        Proctor.stopBehaviorMonitor();
        Proctor.stopFaceAnalytics();
        await Proctor.stopTelemetry();
    }
}
