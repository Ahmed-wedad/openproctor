## Layout 
taoMyCustomExtension/
│
├── actions/                  # Controller classes handling HTTP requests/routing
│   ├── class.Index.php       # Default controller
│   └── class.CustomApi.php   # Custom feature endpoints
│
├── models/                   # Business logic and data structures
│   ├── ontology/             # RDF/OWL schemas if modifying data models
│   └── service/              # Core business services
│
├── views/                    # Frontend presentation layers
│   ├── css/                  # Extension-specific styles
│   ├── js/                   # AMD or modular JavaScript controllers
│   └── templates/            # HTML/TPL template files
│
├── scripts/                  # CLI tools, installation scripts, or migrations
│   └── install.php           # Script executed during Extension Manager setup
│
└── manifest.php              # CRITICAL: Metadata file defining the extension

The manifest.php file tells TAO's Extension Manager that your folder exists, what it depends on, and how to install it.
<?php
return [
    'name' => 'taoMyCustomExtension',
    'label' => 'My Custom Feature Extension',
    'description' => 'Integrates custom scoring or LTI tools.',
    'version' => '1.0.0',
    'author' => 'Your Company Name',
    'dependencies' => [
        'tao' => '>=3.0.0',       # Must explicitly state TAO Core version compatibility
        'taoItems' => '>=3.0.0'   # Depend on other modules if tracking assessment data
    ],
    'routes' => [
        // Defines the entry points for your web controllers
    ],
    'install' => [
        'php' => [
            'scripts/install.php' # Hook to run database setup or setup folder rights
        ]
    ]
];

Modularity Best Practices for TAOTo build a sustainable architecture, follow these software industry rules specifically for TAO:Use the Generis Framework APIs: TAO runs on a specialized semantic web framework called Generis. Instead of writing raw SQL tables, use the Generis Ontology API (models/ontology/) to define your custom test/item data properties. This keeps data structures natively integrated.Register via the Extensions Manager: Never just copy-paste files. Go to Settings > Extensions Manager in the TAO dashboard to install, activate, and securely register your new plugin structure.Leverage Cross-Extension Hooks: If your extension needs to intercept a student submitting an exam, do not modify the taoDelivery source code. Register an event listener inside your extension to catch the core submission event hook.

## 2 features
### 2.1 
Utilize the standard Web APIs (MediaDevices.getUserMedia()) to request access to the user's webcam, microphone, and desktop screen.Implement Event Listeners to detect unauthorized actions, such as page blur events, window resizing, or copying and pasting.
### 2.2
Implement Event Listeners to detect unauthorized actions, such as page blur events, window resizing, or copying and pasting.
### 2.3 
the AI directly inside the candidate's browser instead.Deploy lightweight open-source models like TensorFlow.js, MediaPipe, or Face-api.js to run locally on the candidate's machine.The local script can track facial movements, monitor eye-gaze deviation, and count the number of faces present in the video feed.The Payload: Instead of streaming raw video back to your servers, the browser only sends tiny, lightweight telemetry flags to your database (e.g., {"timestamp": 1240, "issue": "face_not_detected"}).
### 3: Server-Side Processing & Human Auditing
Create a lightweight backend microservice (using Node.js, Go) specifically to collect these telemetry flags.If a candidate's local AI flags multiple consecutive violations, your custom backend updates a status flag in the central grading system.Instead of building a complex live-streaming dashboard, use a basic media server (such as Kurento or Mediasoup) to capture random snapshot images or 5-second video clips every few minutes. Store these files securely on an object storage server like AWS S3 or MinIO so administrators can review flagged anomalies after the exam finishes.