"use client";

import type { RunEvent } from "./contract";

/**
 * Where a run's events come from. The live screens don't care which:
 * - live: the API's SSE stream (EventSource reconnects with Last-Event-ID on its own)
 * - recorded: a real run captured from the API, replayed with its own pacing
 */
export interface RunSource {
  /** Starts delivering events. Returns a stop function. */
  start(onEvent: (e: RunEvent) => void, onError: (message: string) => void): () => void;
}

const TERMINAL = new Set(["CLEANED", "CLEANUP_FAILED"]);

export function isTerminal(e: RunEvent): boolean {
  return e.type === "status_changed" && TERMINAL.has(e.data.to);
}

export function liveSource(runId: string): RunSource {
  return {
    start(onEvent, onError) {
      const es = new EventSource(`/api/runs/${runId}/events`);
      let last = 0;
      let drops = 0;
      es.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data) as RunEvent;
          if (e.seq <= last) return; // a reconnect can resend; keep each event once
          last = e.seq;
          drops = 0;
          onEvent(e);
          if (isTerminal(e)) es.close();
        } catch {
          // A malformed line is skipped; the next event still arrives.
        }
      };
      es.onerror = () => {
        drops += 1;
        if (es.readyState === EventSource.CLOSED || drops > 8) {
          es.close();
          onError("Lost the connection to the run. Its status is saved; reload to see where it got to.");
        }
      };
      return () => es.close();
    },
  };
}

/**
 * Replays recorded events. Gaps between events keep their order and roughly their rhythm,
 * clamped so a whole run plays in a few seconds.
 * `until` stops after the first event it matches (e.g. waiting for approval); `from` resumes after a seq.
 */
export function recordedSource(
  events: RunEvent[],
  opts: { from?: number; until?: (e: RunEvent) => boolean; speed?: number } = {},
): RunSource {
  return {
    start(onEvent) {
      const list = events.filter((e) => e.seq > (opts.from ?? 0));
      let i = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = () => {
        if (i >= list.length) return;
        const e = list[i++];
        onEvent(e);
        if (opts.until?.(e)) return;
        const after = list[i];
        if (!after) return;
        const gap = new Date(after.ts).getTime() - new Date(e.ts).getTime();
        timer = setTimeout(next, Math.min(1100, Math.max(260, gap * (opts.speed ?? 0.6))));
      };
      timer = setTimeout(next, 300);
      return () => clearTimeout(timer);
    },
  };
}
