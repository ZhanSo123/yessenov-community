"use client";

type RealtimePayload = {
  channel: string;
  payload: Record<string, unknown>;
  at: string;
};

type RealtimeHandler = (message: RealtimePayload) => void;

class RealtimeClient {
  private source: EventSource | null = null;
  private listeners = new Map<string, Set<RealtimeHandler>>();
  private reconnectTimer: number | null = null;
  private closeTimer: number | null = null;
  private retryDelay = 1000;
  private connecting = false;
  private attached = new Set<string>();

  subscribe(event: string, handler: RealtimeHandler) {
    if (typeof window === "undefined") {
      return () => {};
    }

    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    this.ensureConnected();
    this.attachEvent(event);

    return () => {
      const listeners = this.listeners.get(event);
      listeners?.delete(handler);
      if (listeners && listeners.size === 0) {
        this.listeners.delete(event);
      }
      this.scheduleCloseIfIdle();
    };
  }

  private ensureConnected() {
    if (this.source || this.connecting || this.listeners.size === 0) {
      return;
    }

    if (this.closeTimer) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    this.connecting = true;
    const source = new EventSource("/api/realtime/stream");
    this.source = source;
    this.attached.clear();

    source.addEventListener("ready", () => {
      this.retryDelay = 1000;
    });

    for (const event of this.listeners.keys()) {
      this.attachEvent(event);
    }

    source.onerror = () => {
      if (this.source !== source) {
        return;
      }
      this.source = null;
      source.close();
      this.scheduleReconnect();
    };

    this.connecting = false;
  }

  private attachEvent(event: string) {
    if (!this.source || this.attached.has(event)) {
      return;
    }
    this.attached.add(event);
    this.source.addEventListener(event, (evt) => {
      const data = this.parseEvent(evt);
      if (!data) {
        return;
      }
      const listeners = this.listeners.get(event);
      if (!listeners || listeners.size === 0) {
        return;
      }
      listeners.forEach((listener) => listener(data));
    });
  }

  private parseEvent(evt: Event): RealtimePayload | null {
    if (!(evt instanceof MessageEvent)) {
      return null;
    }
    try {
      return JSON.parse(evt.data) as RealtimePayload;
    } catch {
      return null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.listeners.size === 0) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
      this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    }, this.retryDelay);
  }

  private scheduleCloseIfIdle() {
    if (this.listeners.size > 0) {
      return;
    }
    if (this.closeTimer) {
      return;
    }
    this.closeTimer = window.setTimeout(() => {
      if (this.listeners.size > 0) {
        this.closeTimer = null;
        return;
      }
      this.source?.close();
      this.source = null;
      this.closeTimer = null;
    }, 3000);
  }
}

const client = new RealtimeClient();

export const getRealtimeClient = () => client;
