import { homeSample } from "@/mocks/home";
import { connectionsSample, profileSample } from "@/mocks/my-ai";
import { MyAiView } from "@/components/my-ai/my-ai-view";

export const metadata = { title: "My AI · Wallio" };

export default function MyAiPage() {
  // TODO(api): replace with GET /api/inventory, GET /api/profile and GET /api/connections.
  return (
    <MyAiView
      initial={homeSample.subscriptions}
      profile={profileSample}
      connections={connectionsSample}
      today={homeSample.today}
    />
  );
}
