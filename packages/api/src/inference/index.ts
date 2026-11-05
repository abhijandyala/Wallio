import pinned from "./pinned-models.json" with { type: "json" };
import { loadInferenceConfig, type PinnedModels } from "./config.ts";
import { InferenceGateway, type GatewayDeps } from "./gateway.ts";

export * from "./config.ts";
export * from "./gateway.ts";

/** Builds the gateway from env + pinned models. Throws a clear config error if anything is missing. */
export function createInferenceGateway(deps: GatewayDeps = {}, env: Record<string, string | undefined> = process.env): InferenceGateway {
  return new InferenceGateway(loadInferenceConfig(env, pinned as PinnedModels), deps);
}
