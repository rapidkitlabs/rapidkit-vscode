import { coreRuntimeCacheKey, type CoreRuntimeResolution } from '../utils/coreRuntimeResolver';

export type ModulesCatalogCachePayload = {
  schema_version: 1;
  modules: Array<Record<string, unknown>>;
  rapidkit_core_version?: string;
  rapidkit_core_location?: CoreRuntimeResolution['location'];
  rapidkit_core_cache_key?: string;
};

export function isModulesCatalogCacheValid(
  cached: ModulesCatalogCachePayload,
  runtime: CoreRuntimeResolution
): boolean {
  const runtimeKey = coreRuntimeCacheKey(runtime);
  // Pre-versioned cache entries are intentionally rejected. A catalog without
  // its producing Core identity can otherwise leak across workspace/runtime
  // upgrades and advertise modules the selected project cannot install.
  if (cached.rapidkit_core_cache_key !== runtimeKey) {
    return false;
  }
  if (runtime.version && cached.rapidkit_core_version !== runtime.version) {
    return false;
  }
  if (cached.rapidkit_core_location !== runtime.location) {
    return false;
  }
  return true;
}
