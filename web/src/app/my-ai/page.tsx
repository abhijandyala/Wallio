import { homeSample } from "@/mocks/home";
import { profileSample } from "@/mocks/my-ai";
import { MyAiView } from "@/components/my-ai/my-ai-view";

export const metadata = { title: "My AI · Wallio" };

export default function MyAiPage() {
  // TODO(api): replace with GET /api/inventory and GET /api/profile.
  return (
    <MyAiView
      initial={homeSample.subscriptions}
      profile={profileSample}
      today={homeSample.today}
    />
  );
}
