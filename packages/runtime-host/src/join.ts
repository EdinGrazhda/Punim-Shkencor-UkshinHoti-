import { randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createSessionCode(length = 6) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function buildJoinUrl(origin: string, code: string) {
  const url = new URL(origin);
  url.pathname = "/join";
  url.search = new URLSearchParams({ code }).toString();
  return url.toString();
}

export function buildJoinPayload(origin: string, code: string) {
  return { code, joinUrl: buildJoinUrl(origin, code), qrValue: buildJoinUrl(origin, code) };
}
