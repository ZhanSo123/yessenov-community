import crypto from "node:crypto";

export const hashIdentityKey = (key: string) =>
  crypto.createHash("sha256").update(key).digest("hex");

export const buildSafetyNumber = (keyA: string, keyB: string) => {
  const [first, second] = [keyA, keyB].sort();
  const hashHex = crypto
    .createHash("sha256")
    .update(`${first}|${second}`)
    .digest("hex");
  const big = BigInt(`0x${hashHex}`);
  let digits = big.toString(10);
  if (digits.length < 60) {
    digits = digits.padStart(60, "0");
  }
  const trimmed = digits.slice(0, 60);
  return trimmed.replace(/(\d{5})(?=\d)/g, "$1 ");
};
