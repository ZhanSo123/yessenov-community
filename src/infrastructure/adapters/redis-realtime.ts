import type { RealtimeGateway } from "@/domain/contracts";

import { publishRealtime } from "@/lib/realtime-broker";

export class RedisRealtimeGateway implements RealtimeGateway {
  async emit<TPayload extends Record<string, unknown>>(
    channel: string,
    event: string,
    payload: TPayload
  ): Promise<void> {
    await publishRealtime({
      channel,
      event,
      payload,
      at: new Date().toISOString(),
    });
  }
}
