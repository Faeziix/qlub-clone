import { assertServerEnv } from "./lib/env";

export function register() {
  assertServerEnv();
}
