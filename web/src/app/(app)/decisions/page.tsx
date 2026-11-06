import { DecisionsLive } from "@/components/decisions/decisions-live";

export const metadata = { title: "Decisions · Wallio" };

/** Decisions come from the Wallio API (GET /api/decisions, contracts v0.3). */
export default function DecisionsPage() {
  return <DecisionsLive />;
}
