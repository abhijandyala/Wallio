import { PageHeader } from "./page-header";
import { Panel } from "./panel";

/** Honest placeholder for tabs that aren't built yet. No fake buttons. */
export function PlannedPage({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col gap-section">
      <PageHeader title={title} subtitle={subtitle} />
      <Panel title="Coming in this tab" flush>
        <ul className="grid border-t border-line sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex h-14 items-center gap-3 border-b border-line px-6 text-text-2 sm:odd:border-r"
            >
              <span
                className="size-1.5 rounded-[1px] bg-text-disabled"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
