"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { api, explainFailure } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type Choice = "accept" | "defer" | "disagree";

const DONE: Record<Choice, string> = {
  accept: "You accepted this.",
  defer: "Saved for later. It comes back in 14 days.",
  disagree: "Noted that you disagree.",
};

/**
 * Your call on the answer. Accept and disagree go to POST /api/decisions; "Later" uses the
 * defer endpoint (14 days by default). A recorded run's recommendation isn't in this
 * workspace, so there the choice is only shown, not saved.
 */
export function DecisionBar({ recommendationId, recorded }: { recommendationId: string; recorded: boolean }) {
  const [busy, setBusy] = useState<Choice | null>(null);
  const [done, setDone] = useState<Choice | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(c: Choice) {
    setError(null);
    if (recorded) {
      setDone(c);
      return;
    }
    setBusy(c);
    try {
      if (c === "defer") await api.defer(recommendationId);
      else await api.recordDecision({ recommendationId, choice: c });
      setDone(c);
    } catch (e) {
      setError(explainFailure(e));
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
        <span className="flex items-center gap-2 text-text-1">
          <Check size={14} weight="bold" className="text-lime" />
          {DONE[done]}
          {recorded && <span className="text-text-3">Demo playback, so it isn&apos;t saved.</span>}
        </span>
        {!recorded && (
          <Link href="/decisions" className="flex items-center gap-1.5 text-[13px] text-text-2 transition-colors hover:text-text-1">
            See it in Decisions <ArrowRight size={13} />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-text-2">Your call. It&apos;s saved to Decisions, and Wallio checks back in 14 days.</span>
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy !== null} onClick={() => void choose("accept")}>
            {busy === "accept" ? "Saving…" : "Accept"}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => void choose("defer")}>
            {busy === "defer" ? "Saving…" : "Later"}
          </Button>
          <Button variant="ghost" disabled={busy !== null} onClick={() => void choose("disagree")}>
            {busy === "disagree" ? "Saving…" : "I disagree"}
          </Button>
        </span>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
