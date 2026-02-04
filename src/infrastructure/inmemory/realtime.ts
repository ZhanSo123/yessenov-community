import type { RealtimeGateway } from "@/domain/contracts";

export class InMemoryRealtimeGateway implements RealtimeGateway {
  async emit<TPayload extends Record<string, unknown>>(
    _channel: string,
    _event: string,
    _payload: TPayload
  ): Promise<void> {
    return;
  }
}
