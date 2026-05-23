import type { Environment } from "../../../shared/environmentTypes";
import type { OneStreamApiClient } from "./types";
import { createMockClient } from "./mockClient";
import { createHttpClient } from "./httpClient";

export type { OneStreamApiClient } from "./types";

export function createOneStreamClient(env: Environment): OneStreamApiClient {
  if (env.type === "mock") {
    return createMockClient(env);
  }
  return createHttpClient(env);
}
