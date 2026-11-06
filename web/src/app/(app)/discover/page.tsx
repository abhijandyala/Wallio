import { discoverSample } from "@/mocks/discover";
import { DiscoverView } from "@/components/discover/discover-view";

export const metadata = { title: "Discover · Wallio" };

export default function DiscoverPage() {
  // TODO(api): replace with GET /api/matches. Ranking stays on the backend.
  return <DiscoverView data={discoverSample} />;
}
