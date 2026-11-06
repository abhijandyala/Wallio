import type { Metadata } from "next";
import { TextPage } from "@/components/landing/site-chrome";

export const metadata: Metadata = { title: "Privacy · Wallio" };

/** Plain privacy notice for the hackathon build. Keep it in step with what the API actually stores. */
export default function PrivacyPage() {
  return (
    <TextPage
      title="Privacy"
      updated="Updated 5 November 2026. Wallio is a hackathon project."
      sections={[
        {
          heading: "What Wallio stores",
          body: (
            <p>
              The AI tools you add, your profile (role, workflows, budget, preferences), the runs you start, and the
              evidence those runs capture: page screenshots, short quoted excerpts, page hashes and test results.
            </p>
          ),
        },
        {
          heading: "Where it lives",
          body: (
            <p>
              In a guest workspace of your own on Wallio&apos;s API server on Vultr Cloud Compute. Each visitor gets a
              separate workspace, enforced by row-level security in the database. Guest workspaces expire on their
              own. Reset demo in Settings starts you on a fresh one.
            </p>
          ),
        },
        {
          heading: "What it never does",
          body: (
            <>
              <p>It never uses your data to train a model.</p>
              <p>It never asks for passwords, card numbers or API keys, and the agent never receives them.</p>
              <p>
                It never reads your code. Comparisons run a sample task on a test page Wallio owns, so nothing private
                leaves your machine.
              </p>
            </>
          ),
        },
        {
          heading: "Models and browsing",
          body: (
            <p>
              Agent model calls go to Vultr Serverless Inference. Browsing happens in an isolated browser on a Vultr
              runner, which may only visit hosts on that run&apos;s allowlist and is deleted when the job ends.
            </p>
          ),
        },
        {
          heading: "Settings on this device",
          body: (
            <p>
              Display and notification settings are saved in your browser until the API stores them. Clearing your
              browser data removes them.
            </p>
          ),
        },
      ]}
    />
  );
}
