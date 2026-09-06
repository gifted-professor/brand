/** Leading + trailing updates, explicit final flush, and no idle polling loop. */
export function createThrottledUpdater(update: () => void, intervalMs: number) {
  let lastUpdate = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const flush = () => { cancel(); lastUpdate = performance.now(); update(); };
  const schedule = () => {
    const remaining = intervalMs - (performance.now() - lastUpdate);
    if (remaining <= 0) flush();
    else if (timer === undefined) timer = setTimeout(flush, remaining);
  };
  return { schedule, flush, cancel };
}
