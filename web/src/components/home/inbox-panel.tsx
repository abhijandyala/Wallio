import type { InboxItem } from "@/lib/types";
import { Panel } from "@/components/kit/panel";
import { List, ListItem } from "@/components/kit/list";

export function InboxPanel({ items }: { items: InboxItem[] }) {
  return (
    <Panel
      title="Inbox"
      action={{ label: "All decisions", href: "/decisions" }}
      flush
    >
      {items.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-text-3">
          You&rsquo;re all caught up.
        </p>
      ) : (
        <List className="border-t border-line">
          {items.map((item) => (
            <ListItem
              key={item.id}
              title={item.title}
              meta={item.meta}
              href={item.href}
              highlight={item.needsYou}
            />
          ))}
        </List>
      )}
    </Panel>
  );
}
