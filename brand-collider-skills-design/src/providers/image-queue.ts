/** Shared by every image provider in this Node process (including separate sessions).
 * Separate CLI processes do not share this limiter; submit a material set as one batch.
 */
export const MAX_IMAGE_CONCURRENCY = 4;
export class ImageQueueCapacityError extends Error {
  constructor() { super('image_provider_waiting_capacity'); }
}

class ImageGenerationQueue {
  #active = 0;
  #unknown = new Set<string>();
  #waiting: Array<{ start: () => void; reject: (error: Error) => void }> = [];

  status() { return { limit: MAX_IMAGE_CONCURRENCY, active: this.#active, unknown: this.#unknown.size, unknownRequestIds: [...this.#unknown] }; }

  reconcile(requestId: string, outcome: 'succeeded' | 'failed' | 'cancelled', evidence: string) {
    if (!requestId || !['succeeded', 'failed', 'cancelled'].includes(outcome) || !evidence || evidence.trim().length < 10) throw new Error('image_queue_invalid_reconciliation');
    const released = this.#unknown.delete(requestId);
    this.#drain();
    return { released, requestId, outcome };
  }

  #drain() {
    while (this.#waiting.length && this.#active + this.#unknown.size < MAX_IMAGE_CONCURRENCY) this.#waiting.shift()!.start();
    if (!this.#active && this.#unknown.size >= MAX_IMAGE_CONCURRENCY) {
      for (const waiting of this.#waiting.splice(0)) waiting.reject(new ImageQueueCapacityError());
    }
  }

  async run<T>(operation: () => Promise<T>, retainUnknown?: (error: unknown) => string | undefined): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      const start = () => { this.#active += 1; resolve(); };
      if (this.#active + this.#unknown.size < MAX_IMAGE_CONCURRENCY) start();
      else if (!this.#active) reject(new ImageQueueCapacityError());
      else this.#waiting.push({ start, reject });
    });
    try { return await operation(); }
    catch (error) {
      const requestId = retainUnknown?.(error);
      if (requestId) this.#unknown.add(requestId);
      throw error;
    }
    finally {
      this.#active -= 1;
      this.#drain();
    }
  }
}

export const imageGenerationQueue = new ImageGenerationQueue();

/** The trusted host must first verify a terminal upstream outcome; this never retries. */
export function reconcileUnknownImageRequest(input: { requestId: string; outcome: 'succeeded' | 'failed' | 'cancelled'; evidence: string }) {
  return imageGenerationQueue.reconcile(input.requestId, input.outcome, input.evidence);
}
