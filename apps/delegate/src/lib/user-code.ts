import { randomInt } from "node:crypto";

/** Short, unambiguous codes a person can type: KQ7M-42XD. */
export function userCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${pick()}-${pick()}`;
}
