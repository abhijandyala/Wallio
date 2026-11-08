import { Info } from "@phosphor-icons/react/dist/ssr";
import { ToolMark } from "@/components/kit/tool-mark";
import type { Subscription } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { Table, Th, Tr, Td } from "@/components/kit/table";
import { Money } from "@/components/kit/money";
import { Tag } from "@/components/kit/tag";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { daysUntil, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StackPanel({
  subscriptions,
  today,
}: {
  subscriptions: Subscription[];
  today: string;
}) {
  return (
    <Panel
      title="Your stack"
      titleAddon={
        <Tooltip>
          <TooltipTrigger
            aria-label="Where these numbers come from"
            className="grid size-5 place-items-center rounded text-text-3 hover:text-text-1"
          >
            <Info size={15} />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 bg-surface-3 text-[12px] leading-[17px] text-text-2 [&_svg]:hidden">
            Entered by you. Wallio doesn&rsquo;t track usage, so it never
            assumes a tool is unused.
          </TooltipContent>
        </Tooltip>
      }
      action={{ label: "Manage", href: "/my-ai" }}
      flush
    >
      <Table>
        <thead>
          <tr>
            <Th>Tool</Th>
            <Th>Plan</Th>
            <Th align="right">Per month</Th>
            <Th align="right">Renews</Th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((s) => {
            const soon =
              s.renewsOn !== null && daysUntil(s.renewsOn, today) <= 14;
            return (
              <Tr key={s.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <ToolMark name={s.toolName} />
                    <span className="text-text-1">{s.toolName}</span>
                    {s.source === "sample" && <Tag kind="sample" />}
                  </div>
                </Td>
                <Td className="text-text-2">
                  {s.plan}
                  {s.cadence === "annual" && (
                    <span className="text-text-3">, yearly</span>
                  )}
                  {/* Paused tools stay listed but don't count toward the monthly total. */}
                  {s.status === "paused" && (
                    <span className="text-text-3">, paused</span>
                  )}
                </Td>
                <Td align="right">
                  <Money
                    cents={s.monthlyCents}
                    className={
                      s.monthlyCents === null || s.status === "paused" ? "text-text-3" : "text-text-1"
                    }
                  />
                </Td>
                <Td
                  align="right"
                  className={cn(soon ? "text-aurora" : "text-text-2")}
                >
                  {s.renewsOn ? (
                    formatShortDate(s.renewsOn)
                  ) : (
                    <span className="text-text-3">—</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </Panel>
  );
}
