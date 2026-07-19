'use client';  // Ensure this is a client-side component

import { useEffect, useRef, useState } from 'react';
import { Proctor } from '../lib';  // Import the SDK
import * as blazeface from '@tensorflow-models/blazeface';  // Import BlazeFace from TensorFlow.js
import { BehaviorViolation, FaceAnalyticsResult } from '../types/proctor';

const SERVER_URL = process.env.NEXT_PUBLIC_PROCTOR_SERVER ?? 'http://localhost:4000';
const SESSION_ID = `sess-${Date.now()}`;

const HomePage = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null); // Ref for the camera video element
    const canvasRef = useRef<HTMLCanvasElement | null>(null); // Ref for the canvas to draw face boxes
    const [isProctoringActive, setProctoringActive] = useState(false); // State to track if proctoring is active
    const [blazeFaceModel, setBlazeFaceModel] = useState<blazeface.BlazeFaceModel | null>(null); // Store the BlazeFace model
    const [behaviorLog, setBehaviorLog] = useState<BehaviorViolation[]>([]);
    const [analytics, setAnalytics] = useState<FaceAnalyticsResult | null>(null);
    const [telemetryErrors, setTelemetryErrors] = useState<string[]>([]);

    // Load the BlazeFace model when the component mounts
    useEffect(() => {
        const loadModel = async () => {
            const model = await blazeface.load();
            setBlazeFaceModel(model);
        };
        loadModel();
    }, []);

    // Detect faces from the camera stream (BlazeFace overlay)
    const detectFaces = async () => {
        if (videoRef.current && blazeFaceModel) {
            const ctx = canvasRef.current!.getContext('2d');
            const video = videoRef.current;
            canvasRef.current!.width = video.width;
            canvasRef.current!.height = video.height;

            setInterval(async () => {
                const predictions = await blazeFaceModel.estimateFaces(video, false);
                ctx!.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                if (predictions.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    predictions.forEach((prediction: any) => {
                        const [x, y, width, height] = prediction.topLeft.concat(prediction.bottomRight);
                        ctx!.beginPath();
                        ctx!.rect(x, y, width - x, height - y);
                        ctx!.lineWidth = 2;
                        ctx!.strokeStyle = 'red';
                        ctx!.stroke();
                    });
                }
            }, 100);
        }
    };

    // Handler for starting the proctoring and face detection
    const handleStart = () => {
        setProctoringActive(true);  // Mark proctoring as active
        Proctor.setup({
            sessionId: SESSION_ID,
            telemetryServerUrl: SERVER_URL,
            onVideoFrame: (cameraStream: MediaStream) => {
                if (videoRef.current) {
                    videoRef.current.srcObject = cameraStream;
                    videoRef.current.play();
                    detectFaces();
                }
            },
            onAudioStream: (audioStream) => console.log('Audio stream received:', audioStream),
            onScreenStream: (screenStream: MediaStream) => console.log('Screen Stream', screenStream),
            onTabSwitch: () => {
                console.log('Tab switch detected!');
                alert('You switched tabs! Please return to the test.');
            },
            // Phase 1 (2.1/2.2): behavior monitoring
            onBehaviorViolation: (v) => {
                console.log('Behavior violation:', v);
                setBehaviorLog((prev) => [v, ...prev].slice(0, 50));
            },
            // Phase 2 (2.3): face analytics
            onFaceAnalytics: (result) => setAnalytics(result),
            onTelemetryError: (err) => {
                console.error('Telemetry error:', err);
                setTelemetryErrors((prev) => [err.message, ...prev].slice(0, 10));
            },
            videoElement: videoRef.current ?? undefined,
            canvasElement: canvasRef.current ?? undefined,
        });
    };

    // Handler for stopping the proctoring
    const handleStop = async () => {
        console.log('Proctoring stopped.');
        setProctoringActive(false);  // Mark proctoring as inactive
        await Proctor.stop();
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    return (
        <div style={{ fontFamily: 'sans-serif', padding: 20 }}>
            <h1>OpenProctor — Camera, Screen, Audio &amp; Face Analytics</h1>
            <p>Session: <code>{SESSION_ID}</code> · Server: <code>{SERVER_URL}</code></p>

            <div style={{ position: 'relative', display: 'inline-block' }}>
                <video
                    ref={videoRef}
                    width="640"
                    height="480"
                    autoPlay
                    muted
                    style={{ border: '1px solid black', marginTop: 20 }}
                />
                <canvas
                    ref={canvasRef}
                    width="640"
                    height="480"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                />
            </div>

            <div style={{ marginTop: 20 }}>
                {!isProctoringActive ? (
                    <button onClick={handleStart} style={btn('green')}>Start Proctoring</button>
                ) : (
                    <button onClick={handleStop} style={btn('red')}>Stop Proctoring</button>
                )}
            </div>

            <div style={{ display: 'flex', gap: 40, marginTop: 30 }}>
                <section>
                    <h3>Face Analytics (MediaPipe)</h3>
                    {analytics ? (
                        <ul>
                            <li>Faces: {analytics.faceCount}</li>
                            <li>Gaze deviation: {analytics.gazeDeviationDeg}°</li>
                            <li>Head yaw/pitch/roll: {analytics.headYawDeg}° / {analytics.headPitchDeg}° / {analytics.headRollDeg}°</li>
                            <li>Issues: {analytics.issues.length ? analytics.issues.join(', ') : 'none'}</li>
                        </ul>
                    ) : <p>Not running.</p>}
                </section>

                <section>
                    <h3>Behavior Violations (2.1 / 2.2)</h3>
                    {behaviorLog.length ? (
                        <ul style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {behaviorLog.map((v, i) => (
                                <li key={i}>{v.type} @ {new Date(v.timestamp).toLocaleTimeString()}</li>
                            ))}
                        </ul>
                    ) : <p>None yet.</p>}
                </section>
            </div>

            {telemetryErrors.length > 0 && (
                <p style={{ color: 'red' }}>Telemetry errors: {telemetryErrors[0]}</p>
            )}
        </div>
    );
};

const btn = (color: string): React.CSSProperties => ({
    marginTop: 20, padding: '10px 20px', backgroundColor: color, color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer',
});

export default HomePage;
