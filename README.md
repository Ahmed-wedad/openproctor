Here’s a **README.md** file for your project, covering all the steps and guidelines for getting started with your proctoring SDK, implementing face detection, and handling contributions.

---

# OpenProctor is an open-source Proctoring SDK with Face Detection and Media Stream Uploading

This repository contains a **Proctoring SDK** that allows:
- Capturing **camera**, **microphone**, and **screen share** streams.
- Real-time **face detection** using **TensorFlow.js BlazeFace**.
- Streaming and **uploading** media streams to a server for analysis and storage.

## Features

- **Camera, Microphone, and Screen Sharing**: Capture video, audio, and screen streams.
- **Real-time Face Detection**: Detect faces from the camera stream using BlazeFace.
- **Behavior Monitoring (2.1/2.2)**: Detect page blur, window resize, and copy/cut/paste via event listeners.
- **In-Browser AI Analytics (2.3)**: MediaPipe Face Landmarker tracks face count, eye-gaze deviation, and head pose — emitting lightweight telemetry flags (no raw video streaming).
- **Backend Microservice (3)**: Node.js + TypeScript service that buffers telemetry in **Redis** (write-behind cache) and bulk-syncs to **PostgreSQL**, stores snapshots in **MinIO**, and exposes a review API for post-exam human auditing.
- **Proctoring Setup**: Control when to start and stop media streams and face detection.

## Table of Contents

1. [Get Started](#get-started)
2. [Using the SDK](#using-the-sdk)
3. [Face Detection](#face-detection)
4. [Uploading Streams to Server](#uploading-streams-to-server)
5. [Backend Microservice](#backend-microservice)
6. [Contribution Guidelines](#contribution-guidelines)

---

## Get Started

### Prerequisites

- **Node.js** (version 14 or later)
- **npm** or **yarn**

### Clone the Repository

```bash
git clone https://github.com/your-username/proctoring-sdk.git
cd proctoring-sdk
```

### Install Dependencies

Install the dependencies using **npm** or **yarn**:

```bash
npm install
```

or

```bash
yarn install
```

### Start the Development Server

```bash
npm run dev
```

This will start the Next.js development server. Visit `http://localhost:3000` in your browser to view the application.

---

## Using the SDK

### Importing the Proctoring SDK

The SDK provides functions to set up the camera, microphone, screen sharing, and face detection. Use the alias `@/lib` to import the SDK components in your project.

```typescript
import { Proctor } from '@/lib';
```

### Starting Proctoring

To start capturing the camera, microphone, and screen sharing, and run face detection:

```typescript
Proctor.setup({
  onVideoFrame: (cameraStream: MediaStream) => {
    // Handle the camera stream (e.g., attach to a video element)
  },
  videoElement: videoRef.current,  // The video element for face detection
  canvasElement: canvasRef.current,  // The canvas element to draw face boxes
  onAudioStream: (audioStream: MediaStream) => {
    // Handle the audio stream
  },
  onScreenStream: (screenStream: MediaStream) => {
    // Handle the screen sharing stream
  },
  onTabSwitch: () => {
    // Handle tab switch detection
    alert('You switched tabs! Please return to the test.');
  }
});
```

### Stopping Proctoring

To stop all active streams and face detection:

```typescript
Proctor.stopCamera();
Proctor.stopMicrophone();
Proctor.stopScreenShare();
```

---

## Face Detection

This SDK uses **TensorFlow.js BlazeFace** for real-time face detection. The face detection model is loaded automatically when the camera stream starts. The results (face bounding boxes) are drawn on a canvas overlay.

### How It Works

1. The **BlazeFace** model is loaded and used to detect faces in real-time from the camera feed.
2. Face bounding boxes are drawn on a canvas overlaid on the video stream.

### Key Code for Face Detection

Face detection is set up when the camera stream is initialized:

```typescript
import { FaceDetection } from '@/lib/faceDetection';

Proctor.setup({
  onVideoFrame: (cameraStream: MediaStream) => {
    // Attach the camera stream to the video element and start face detection
    FaceDetection.detectFaces(videoRef.current, canvasRef.current);
  },
  videoElement: videoRef.current,  // The video element for face detection
  canvasElement: canvasRef.current  // The canvas element to draw face boxes
});
```

---

## Uploading Streams to Server

The SDK includes a `StreamUploader` class that allows you to capture and upload the media streams (camera, microphone, and screen) to a server for analysis and storage.

### How to Use the StreamUploader

```typescript
import { StreamUploader } from '@/lib/streamUploader';

// Initialize the uploader
const uploader = new StreamUploader({
  videoStream: cameraStream,
  audioStream: audioStream,
  screenStream: screenStream,
  serverUrl: 'https://your-server-url/upload'  // Server endpoint to upload streams
});

// Start uploading the streams
uploader.start();
```

### Server-Side Example (Express.js)

The following is an example of an Express.js server to handle media uploads:

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  console.log(`File uploaded: ${req.file.originalname}`);
  res.status(200).send('File uploaded successfully.');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```

---

## Backend Microservice

The `server/` directory contains a Node.js + TypeScript microservice that ingests the
telemetry flags emitted by the SDK, buffers them in **Redis** (write-behind cache), and
bulk-syncs them to **PostgreSQL**. Snapshots are stored in **MinIO** (S3-compatible) and a
review API lets administrators audit flagged sessions after the exam.

### Architecture

```
Browser (telemetry flags) ──POST /api/telemetry──▶ Redis buffer
                                               └─▶ [sync worker, 5s] ──▶ PostgreSQL
Browser (snapshot)        ──POST /api/snapshot──▶ MinIO
Admin                     ──GET  /api/review/:id─▶ PostgreSQL + signed MinIO URLs
```

### Run with Docker (Postgres + Redis + MinIO)

```bash
docker-compose up -d
```

### Configure & run the server

```bash
cd server
cp .env.example .env      # adjust DB_URL / REDIS_URL / MINIO_* as needed
npm install
npm run db:init           # create tables (or let initDb() create them on boot)
npm run dev               # tsx watch
```

### Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `4000` | Microservice port |
| `DB_URL` | `postgres://openproctor:openproctor@localhost:5432/openproctor` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis (telemetry write-behind cache) |
| `MINIO_*` | `localhost:9000` / `minioadmin` | MinIO object storage |
| `CONSECUTIVE_VIOLATIONS_THRESHOLD` | `5` | Consecutive violations before a session is flagged |

### API

- `POST /api/telemetry` — body `{ sessionId, flags: [{ timestamp, issue, detail }] }`. Flags are buffered in Redis; the sync worker flushes them to Postgres. If ≥ `CONSECUTIVE_VIOLATIONS_THRESHOLD` consecutive violations occur, the session status is set to `flagged`.
- `POST /api/snapshot` — `multipart/form-data` with `file`, `sessionId`, `timestamp`. Stored in MinIO.
- `GET /api/sessions` — list sessions (flagged first).
- `GET /api/review/:sessionId` — telemetry, violations, and signed snapshot URLs for a session.

### Frontend wiring

Set `NEXT_PUBLIC_PROCTOR_SERVER` (defaults to `http://localhost:4000`) so the SDK knows where
to send telemetry and snapshots. The demo page (`app/page.tsx`) shows a live behavior-violation
log and MediaPipe face-analytics panel.

---

## Contribution Guidelines

We welcome contributions to this project. Here’s how you can contribute:

### 1. Fork the Repository

Fork the project repository to your own GitHub account by clicking the **Fork** button at the top right of the repository page.

### 2. Clone Your Fork

Clone your fork to your local machine:

```bash
git clone https://github.com/your-username/proctoring-sdk.git
```

### 3. Create a Branch

Create a new branch for your feature or bug fix:

```bash
git checkout -b feature/new-feature
```

### 4. Make Your Changes

Make your changes in the codebase, and be sure to write unit tests for any new functionality.

### 5. Run Tests

Ensure that all tests pass before submitting your changes:

```bash
npm run test
```

### 6. Commit and Push

Commit your changes and push the branch to your fork:

```bash
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

### 7. Submit a Pull Request

Submit a pull request to the main repository, and provide a detailed description of your changes.

---

## License

This project is licensed under the GNU License 3.0.

---

Let me know if you need any further clarifications or additions to the `README.md`!

## Contact

👋 hello@codseg.com

