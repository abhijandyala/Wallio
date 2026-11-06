"use client";

import { useEffect, useRef } from "react";
import { useReducedMotionConfig } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A screen recording of the app in a glossy window frame. Plays muted and looped only while
 * it's on screen; with reduced motion it waits on its poster and shows the controls instead.
 */
export function AppVideo({
  src,
  poster,
  url,
  caption,
  className,
}: {
  src: string;
  poster: string;
  url: string;
  caption?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotionConfig();

  useEffect(() => {
    const v = ref.current;
    if (!v || reduce) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <figure className={cn("flex flex-col", className)}>
      <div className="wl-gloss overflow-hidden rounded-[1rem] border border-[rgba(201,255,230,0.1)] bg-[var(--wl-900)]">
        {/* Window bar: three dots and where in the app this is. */}
        <div className="flex h-[2.5rem] items-center gap-[0.5rem] border-b border-[rgba(201,255,230,0.08)] px-[1rem]">
          <span className="size-[0.6rem] rounded-full bg-[rgba(201,255,230,0.18)]" />
          <span className="size-[0.6rem] rounded-full bg-[rgba(201,255,230,0.18)]" />
          <span className="size-[0.6rem] rounded-full bg-[rgba(201,255,230,0.18)]" />
          <span className="ml-[0.75rem] rounded-[0.375rem] bg-[rgba(201,255,230,0.06)] px-[0.75rem] py-[0.3rem] text-[0.75rem] leading-none tracking-[0.04rem] text-[var(--wl-silver)]">
            {url}
          </span>
        </div>
        <video
          ref={ref}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          controls={!!reduce}
          aria-label={caption}
          className="block aspect-[16/10] w-full bg-[#020806] object-cover object-top"
        />
      </div>
      {caption && (
        <figcaption className="mt-[0.875rem] text-[0.875rem] leading-[1.25rem] text-[var(--wl-silver)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
