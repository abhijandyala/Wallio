"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { useApiStatus } from "@/lib/api/cache";

/** On the sample Compare screen: a one-line way into the real run. */
export function LiveApiStrip() {
  const status = useApiStatus();
  const line =
    status.state === "online"
      ? `The Wallio API on Vultr is online${status.runMode === "mock" ? " (demo playback)" : ""}. Run GitHub Copilot vs Zed on it.`
      : status.state === "offline"
        ? "The Wallio API can't be reached. Play a run recorded from it."
        : "Checking the Wallio API";
  return (
    <Link
      href="/compare?live=1"
      className="group mb-gutter flex min-h-14 items-center justify-between gap-4 rounded-[20px] border border-line bg-surface-1 px-6 py-3"
    >
      <span className="flex min-w-0 items-center gap-3 text-text-1">
        <span
          className={status.state === "online" ? "size-1.5 shrink-0 rounded-[1px] bg-lime" : "size-1.5 shrink-0 rounded-[1px] bg-text-3"}
          aria-hidden="true"
        />
        <span className="min-w-0">{line}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-text-3 transition-colors group-hover:text-text-1">
        Compare, live <ArrowRight size={13} />
      </span>
    </Link>
  );
}
