import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceGraphProjectionCoalescer } from '../core/workspaceGraphProjectionCoalescer.js';

describe('WorkspaceGraphProjectionCoalescer', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps only the latest value during a burst and exposes pressure telemetry', () => {
    vi.useFakeTimers();
    const emitted: Array<{ value: number; coalesced: number }> = [];
    const coalescer = new WorkspaceGraphProjectionCoalescer<number>(
      (value, stats) => emitted.push({ value, coalesced: stats.coalesced }),
      50
    );
    for (let value = 0; value < 100; value += 1) coalescer.push(value);
    vi.advanceTimersByTime(50);

    expect(emitted).toEqual([{ value: 99, coalesced: 99 }]);
    expect(coalescer.stats()).toEqual({ received: 100, emitted: 1, coalesced: 99 });
  });

  it('clears pending cross-workspace values before they reach the Webview', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const coalescer = new WorkspaceGraphProjectionCoalescer(emit, 50);
    coalescer.push({ workspaceId: 'old' });
    coalescer.clear();
    vi.advanceTimersByTime(100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('can preserve accumulated focus metadata while retaining the newest graph state', () => {
    vi.useFakeTimers();
    const emit = vi.fn();
    const coalescer = new WorkspaceGraphProjectionCoalescer(
      emit,
      50,
      (current: { revision: number; ids: string[] }, incoming) => ({
        ...incoming,
        ids: [...new Set([...current.ids, ...incoming.ids])],
      })
    );
    coalescer.push({ revision: 1, ids: ['a'] });
    coalescer.push({ revision: 2, ids: ['b'] });
    vi.advanceTimersByTime(50);
    expect(emit).toHaveBeenCalledWith(
      { revision: 2, ids: ['a', 'b'] },
      expect.objectContaining({ coalesced: 1 })
    );
  });
});
