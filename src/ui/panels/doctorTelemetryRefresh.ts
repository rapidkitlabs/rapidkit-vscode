import * as path from 'path';

export function extractWorkspacePathFromDoctorReportPath(filePath: string): string | undefined {
  const suffix = `${path.sep}.rapidkit${path.sep}reports${path.sep}doctor-last-run.json`;
  const idx = filePath.lastIndexOf(suffix);
  if (idx <= 0) {
    return undefined;
  }
  return filePath.slice(0, idx);
}

type TimerHandle = ReturnType<typeof setTimeout>;

type CreateDoctorTelemetryRefreshControllerOptions = {
  onRefresh: (explicitWorkspacePath?: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

export function createDoctorTelemetryRefreshController(
  options: CreateDoctorTelemetryRefreshControllerOptions
) {
  const delayMs = options.delayMs ?? 250;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const onError = options.onError ?? (() => undefined);
  let timer: TimerHandle | undefined;

  return {
    schedule(filePath?: string) {
      const explicitWorkspacePath = filePath
        ? extractWorkspacePathFromDoctorReportPath(filePath)
        : undefined;

      if (timer) {
        clearTimer(timer);
      }

      timer = setTimer(() => {
        timer = undefined;
        void Promise.resolve(options.onRefresh(explicitWorkspacePath)).catch((error) => {
          onError(error);
        });
      }, delayMs);
    },
    dispose() {
      if (!timer) {
        return;
      }
      clearTimer(timer);
      timer = undefined;
    },
  };
}
