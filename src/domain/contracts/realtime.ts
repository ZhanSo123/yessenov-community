export interface RealtimeGateway {
  emit<TPayload extends Record<string, unknown>>(
    channel: string,
    event: string,
    payload: TPayload
  ): Promise<void>;
}
