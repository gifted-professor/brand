import { afterEach, describe, expect, it, vi } from 'vitest';
import { createThrottledUpdater } from './throttledUpdater';

afterEach(() => vi.useRealTimers());
describe('Viewport update scheduling', () => {
  it('coalesces pointer moves at 100ms and flushes the exact drag-end position', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    let position = 0;
    const update = vi.fn(() => position);
    const updater = createThrottledUpdater(update, 100);
    for (let i = 0; i < 20; i++) { position = i; updater.schedule(); vi.advanceTimersByTime(4); }
    expect(update).toHaveBeenCalledTimes(1);
    position = 21;
    updater.flush();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveLastReturnedWith(21);
    vi.advanceTimersByTime(1000);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it('runs a trailing wheel update and cancels pending work on unmount', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const update = vi.fn();
    const updater = createThrottledUpdater(update, 100);
    updater.schedule(); vi.advanceTimersByTime(30); updater.schedule();
    vi.advanceTimersByTime(69); expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1); expect(update).toHaveBeenCalledTimes(2);
    updater.schedule(); updater.cancel(); vi.advanceTimersByTime(500);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
