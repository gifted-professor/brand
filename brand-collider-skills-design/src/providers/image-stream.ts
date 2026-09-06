import { StringDecoder } from 'node:string_decoder';

export type ImageStreamMilestone = 'accepted' | 'generating' | 'image_received' | 'completed';
export type ImageStreamTerminal = 'completed' | 'done' | 'failed' | 'incomplete';
export interface ImageStreamObservation {
  /** Newly observed stages only; contains no upstream text or image bytes. */
  milestones: ImageStreamMilestone[];
  /** A framing signal, not proof of a usable image. Validate the accumulated raw response separately. */
  terminal: ImageStreamTerminal | null;
}

type JsonObject = Record<string, unknown>;
const asObject = (value: unknown): JsonObject | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as JsonObject : null;

/** Incrementally observe complete SSE frames without accepting partial image previews.
 * This is deliberately separate from parseImageResponse: framing/progress never
 * validates image bytes, IDs, output count, or successful provider completion.
 */
export class ImageStreamObserver {
  #decoder = new StringDecoder('utf8');
  #firstText = true;
  #skipLeadingLf = false;
  #lineParts: string[] = [];
  #eventName = '';
  #data: string[] = [];
  #seen = new Set<ImageStreamMilestone>();
  #terminal: ImageStreamTerminal | null = null;

  push(chunk: Buffer | string): ImageStreamObservation {
    let text = this.#decoder.write(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    const milestones: ImageStreamMilestone[] = [];
    if (this.#firstText && text) {
      text = text.replace(/^\uFEFF/, '');
      this.#firstText = false;
    }
    if (text && this.#skipLeadingLf) {
      if (text.startsWith('\n')) text = text.slice(1);
      this.#skipLeadingLf = false;
    }

    // Scan only the new chunk. A multi-megabyte base64 line must not be rescanned
    // from its beginning every time another network chunk arrives.
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      const character = text.charCodeAt(index);
      if (character !== 10 && character !== 13) continue;
      this.#lineParts.push(text.slice(start, index));
      this.#line(this.#lineParts.join(''), milestones);
      this.#lineParts = [];
      if (character === 13) {
        if (text.charCodeAt(index + 1) === 10) index += 1;
        else if (index === text.length - 1) this.#skipLeadingLf = true;
      }
      start = index + 1;
    }
    if (start < text.length) this.#lineParts.push(text.slice(start));

    // All frames in this chunk are examined before a caller can end the HTTP
    // request, so a later failure in the same chunk outranks an earlier final.
    return {
      milestones: this.#terminal === 'failed' || this.#terminal === 'incomplete'
        ? milestones.filter(stage => stage !== 'completed') : milestones,
      terminal: this.#terminal,
    };
  }

  #mark(stage: ImageStreamMilestone, milestones: ImageStreamMilestone[]): void {
    if (this.#seen.has(stage)) return;
    this.#seen.add(stage);
    milestones.push(stage);
  }

  #end(terminal: ImageStreamTerminal): void {
    const priority = { done: 1, completed: 2, incomplete: 3, failed: 4 };
    if (!this.#terminal || priority[terminal] > priority[this.#terminal]) this.#terminal = terminal;
  }

  #line(line: string, milestones: ImageStreamMilestone[]): void {
    if (line === '') {
      this.#dispatch(milestones);
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.#eventName = value;
    if (field === 'data') this.#data.push(value);
  }

  #dispatch(milestones: ImageStreamMilestone[]): void {
    const eventName = this.#eventName;
    const data = this.#data.join('\n');
    this.#eventName = '';
    this.#data = [];
    if (!data) return;
    if (data.trim() === '[DONE]') {
      if (!eventName || eventName === 'message') this.#end('done');
      return;
    }
    let payload: JsonObject | null;
    try { payload = asObject(JSON.parse(data)); }
    catch { return; }
    if (!payload) return;
    if (eventName && eventName !== 'message' && typeof payload.type === 'string' && payload.type !== eventName) return;
    const type = typeof payload.type === 'string' ? payload.type : eventName;
    if (type === 'error' || type === 'response.failed') {
      this.#end('failed');
      return;
    }
    if (type === 'response.incomplete') {
      this.#end('incomplete');
      return;
    }
    if (type === 'response.created' || type === 'response.in_progress') {
      if (asObject(payload.response)) this.#mark('accepted', milestones);
      return;
    }
    if (type === 'response.image_generation_call.in_progress' || type === 'response.image_generation_call.generating') {
      this.#mark('generating', milestones);
      return;
    }
    if (type === 'response.output_item.done') {
      if (this.#hasFinalImage(payload.item)) this.#mark('image_received', milestones);
      return;
    }
    // image_generation_call.completed alone carries no final image in the
    // Responses protocol. Wait for output_item.done or response.completed.
    if (type !== 'response.completed') return;
    const response = asObject(payload.response);
    if (!response) return;
    if (response.error != null || response.status === 'failed' || response.status === 'cancelled'
      || response.type === 'error' || response.type === 'response.failed') {
      this.#end('failed');
      return;
    }
    if (response.type === 'response.incomplete' || (response.status != null && response.status !== 'completed')) {
      this.#end('incomplete');
      return;
    }
    if (Array.isArray(response.output) && response.output.some(item => this.#hasFinalImage(item))) {
      this.#mark('image_received', milestones);
    }
    this.#mark('completed', milestones);
    this.#end('completed');
  }

  #hasFinalImage(value: unknown): boolean {
    const item = asObject(value);
    return item?.type === 'image_generation_call' && item.error == null
      && (item.status == null || item.status === 'completed') && typeof item.result === 'string' && item.result.length > 0;
  }
}
