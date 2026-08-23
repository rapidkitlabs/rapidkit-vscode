import type { DashboardCommandContract } from './dashboardCommandContracts';
import { resolveDashboardCommandExecutionPlan } from './dashboardCommandExecutionPlan';
import {
  isDashboardCommandCapabilityAdvertised,
  resolveDashboardCommandCapabilityRequirement,
} from './dashboardCommandCapabilityRequirement';
import { fetchRuntimeCommandSurface } from './runtimeCommandSurface';

export type { DashboardCommandCapabilityRequirement } from './dashboardCommandCapabilityRequirement';
export {
  isDashboardCommandCapabilityAdvertised,
  resolveDashboardCommandCapabilityRequirement,
} from './dashboardCommandCapabilityRequirement';

export async function gateDashboardCommandCapability(input: {
  contract: DashboardCommandContract | undefined;
  commandId: string;
  cwd?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const plan = resolveDashboardCommandExecutionPlan(input.commandId);
  const contract = input.contract ?? plan.contract;
  const requirement =
    plan.capabilityRequirement ?? resolveDashboardCommandCapabilityRequirement(input.contract);
  if (!requirement) {
    return { ok: true };
  }

  const surface = await fetchRuntimeCommandSurface({ cwd: input.cwd });
  if (!surface) {
    const reason = `${contract?.label ?? input.commandId} is blocked because the extension could not read the active Workspai runtime capabilities. Open Setup to validate or reinstall the extension runtime, then reload the window.`;
    return { ok: false, reason };
  }

  if (isDashboardCommandCapabilityAdvertised(surface, requirement)) {
    return { ok: true };
  }

  const reason = `${contract?.label ?? input.commandId} is blocked because the active Workspai runtime ${surface.version || '(unknown version)'} does not advertise \`${requirement.label}\` in \`commands --json\`. Open Setup, then reload the window.`;
  return { ok: false, reason };
}
