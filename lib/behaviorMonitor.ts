// lib/behaviorMonitor.ts
// Phase 1 (2.1 / 2.2): Detect unauthorized actions via browser event listeners.
import { BehaviorViolation, BehaviorViolationType } from '../types/proctor';

export class BehaviorMonitor {
    private listeners: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];
    private resizeTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly resizeDebounceMs: number;

    constructor(private onViolation: (violation: BehaviorViolation) => void, resizeDebounceMs = 500) {
        this.resizeDebounceMs = resizeDebounceMs;
    }

    public start(): void {
        this.register('visibilitychange', document, () => {
            if (document.hidden) {
                this.emit('page_blur');
            } else {
                this.emit('page_focus');
            }
        });

        // window.blur / focus capture clicks outside the window (page blur)
        this.register('blur', window, () => this.emit('page_blur'));
        this.register('focus', window, () => this.emit('page_focus'));

        // window resize (e.g. candidate shrinks the window to peek at notes)
        this.register('resize', window, () => {
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.emit('window_resize', `innerWidth=${window.innerWidth},innerHeight=${window.innerHeight}`);
            }, this.resizeDebounceMs);
        });

        // copy / cut / paste
        this.register('copy', document, () => this.emit('copy'));
        this.register('cut', document, () => this.emit('cut'));
        this.register('paste', document, () => this.emit('paste'));
    }

    public stop(): void {
        for (const { target, type, handler } of this.listeners) {
            target.removeEventListener(type, handler);
        }
        this.listeners = [];
        if (this.resizeTimer) clearTimeout(this.resizeTimer);
    }

    private emit(type: BehaviorViolationType, detail?: string): void {
        this.onViolation({ type, timestamp: Date.now(), detail });
    }

    private register(type: string, target: EventTarget, handler: () => void): void {
        const wrapped = handler as EventListener;
        target.addEventListener(type, wrapped);
        this.listeners.push({ target, type, handler: wrapped });
    }
}
