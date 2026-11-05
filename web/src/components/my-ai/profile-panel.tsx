"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GithubLogo } from "@phosphor-icons/react";
import type { Profile, ProfileField } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// TODO(api): confirm/remove call the profile endpoint and bump the version.
export function ProfilePanel({ profile }: { profile: Profile }) {
  const [fields, setFields] = useState<ProfileField[]>(profile.fields);
  const pending = fields.filter(
    (f) => f.source === "inferred" && f.status === "pending",
  );
  const known = fields.filter(
    (f) => !(f.source === "inferred" && f.status === "pending"),
  );

  const confirm = (id: string) =>
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "confirmed" } : f)),
    );
  const remove = (id: string) =>
    setFields((prev) => prev.filter((f) => f.id !== id));

  return (
    <Panel
      title="What Wallio knows about you"
      titleAddon={
        <span className="tnum text-[13px] font-normal text-text-3">
          Version {profile.version}
        </span>
      }
      className="h-full"
    >
      {/* Guesses waiting for a yes or no */}
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.section
            key="review"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <h3 className="mb-3 flex items-center gap-2 text-[13px] text-text-2">
              <span
                className="size-1.5 rounded-[1px] bg-lavender"
                aria-hidden="true"
              />
              {pending.length}{" "}
              {pending.length === 1 ? "guess needs" : "guesses need"} your
              review
            </h3>
            <ul className="mb-6 grid gap-gutter md:grid-cols-2">
              <AnimatePresence initial={false}>
                {pending.map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    exit={{
                      opacity: 0,
                      scale: 0.97,
                      transition: { duration: 0.15 },
                    }}
                    className="flex flex-col justify-between gap-5 rounded-[16px] border border-lavender/30 bg-lavender-tint p-5"
                  >
                    <div>
                      <p className="text-[13px] text-text-3">{f.label}</p>
                      <p className="mt-1 text-[18px] font-medium text-text-1">
                        {f.value}
                      </p>
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-text-3">
                        <GithubLogo size={13} aria-hidden="true" />
                        {f.inferredFrom?.replace(/^GitHub:\s*/, "") ?? "Import"}
                        {f.confidence && <> · {f.confidence} confidence</>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => confirm(f.id)}
                      >
                        That&rsquo;s right
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(f.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Confirmed facts */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line">
        {known.map((f, i) => (
          <motion.div
            key={f.id}
            layout
            className={cn(
              "bg-surface-1 px-5 py-4",
              i === known.length - 1 && known.length % 2 === 1 && "col-span-2",
            )}
          >
            <dt className="text-[13px] text-text-3">{f.label}</dt>
            <dd className={cn("mt-1 text-[15px] text-text-1")}>{f.value}</dd>
            <dd className="mt-1 text-[12px] text-text-3">
              {f.source === "stated" ? "You said" : "Confirmed by you"}
            </dd>
          </motion.div>
        ))}
      </dl>
    </Panel>
  );
}
