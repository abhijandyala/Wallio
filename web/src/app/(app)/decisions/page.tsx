import { decisionsSample } from "@/mocks/decisions";
import { DecisionsView } from "@/components/decisions/decisions-view";

export const metadata = { title: "Decisions · Wallio" };

export default function DecisionsPage() {
  // TODO(api): GET /api/decisions
  return <DecisionsView data={decisionsSample} />;
}
