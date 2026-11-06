import { cn } from "@/lib/utils";

/** Tool name → monochrome logo in /public/logos. See /public/logos/README.md for sources. */
const LOGOS: Record<string, string> = {
  cursor: "cursor",
  claude: "claude",
  chatgpt: "openai",
  openai: "openai",
  perplexity: "perplexity",
  "github copilot": "githubcopilot",
  midjourney: "midjourney",
  windsurf: "windsurf",
  zed: "zed",
  notebooklm: "notebooklm",
  gemini: "gemini",
  "gemini advanced": "gemini",
};

const SIZES = {
  sm: { box: "size-7 rounded-md text-[11px]", logo: "size-4" },
  lg: { box: "size-10 rounded-[10px] text-[13px]", logo: "size-5" },
};

/** A tool's logo in a small square, tinted to match the UI. Falls back to a two-letter monogram. */
export function ToolMark({
  name,
  size = "sm",
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  const slug = LOGOS[name.toLowerCase()];
  const s = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center bg-surface-3 font-medium text-text-2",
        s.box,
      )}
    >
      {slug ? (
        <span
          className={cn("bg-text-1", s.logo)}
          style={{
            mask: `url(/logos/${slug}.svg) center / contain no-repeat`,
            WebkitMask: `url(/logos/${slug}.svg) center / contain no-repeat`,
          }}
        />
      ) : (
        name.slice(0, 2)
      )}
    </span>
  );
}
