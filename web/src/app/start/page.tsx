import { Onboarding } from "@/components/onboarding/onboarding";

export const metadata = { title: "Set up · Wallio" };

/** First run: outside the app rail, like the landing page. */
export default function StartPage() {
  return <Onboarding />;
}
