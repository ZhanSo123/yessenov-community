import type { MessageKey } from "./messages";

type Params = Record<string, string | number | undefined>;

export const formatMessage = (template: string, params?: Params) => {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

export const interpolateMessage = (
  dict: Record<MessageKey, string>,
  key: MessageKey,
  params?: Params
) => formatMessage(dict[key], params);
