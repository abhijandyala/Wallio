import { MyAiLive } from "@/components/my-ai/my-ai-live";

export const metadata = { title: "My AI · Wallio" };

/** My AI comes from the Wallio API: GET /api/inventory, GET /api/profile and GET /api/catalog. */
export default function MyAiPage() {
  return <MyAiLive />;
}
