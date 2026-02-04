import { NextRequest } from "next/server";

import { apiError } from "@/lib/api-errors";
import { requireUserApi } from "@/lib/auth";
import { subscribeRealtime } from "@/lib/realtime-broker";

export const runtime = "nodejs";

const parseChannels = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const requested = parseChannels(searchParams.get("channels"));

    const allowed = new Set<string>();
    allowed.add(`user:${user.id}`);
    if (user.role === "ADMIN" || user.role === "MOD") {
      allowed.add("moderation:system");
    }

    const channels = requested.length
      ? requested.filter((channel) => allowed.has(channel))
      : Array.from(allowed);

    if (channels.length === 0) {
      return apiError("FORBIDDEN", 403);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const subscriptions: Array<() => void> = [];
        let closed = false;

        const send = (event: string, payload: Record<string, unknown>) => {
          if (closed) return;
          const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        const setup = async () => {
          send("ready", { ok: true, channels });

          for (const channel of channels) {
            const unsubscribe = await subscribeRealtime(channel, (message) => {
              send(message.event, {
                channel: message.channel,
                payload: message.payload,
                at: message.at,
              });
            });
            subscriptions.push(unsubscribe);
          }
        };

        void setup();

        const keepAlive = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        }, 20_000);

        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(keepAlive);
          subscriptions.forEach((unsubscribe) => unsubscribe());
          controller.close();
        };

        request.signal.addEventListener("abort", close);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    return apiError("INTERNAL_ERROR", 500);
  }
}
