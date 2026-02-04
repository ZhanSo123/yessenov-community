import en from "./en";
import ru from "./ru";
import kk from "./kk";

export type MessageKey = keyof typeof en;

export const messages = {
  en,
  ru,
  kk,
} as const;
