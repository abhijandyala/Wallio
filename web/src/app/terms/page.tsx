import type { Metadata } from "next";
import { TextPage } from "@/components/landing/site-chrome";

export const metadata: Metadata = { title: "Terms · Wallio" };

/** Plain terms for the hackathon build. */
export default function TermsPage() {
  return (
    <TextPage
      title="Terms"
      updated="Updated 5 November 2026. Wallio is a hackathon project."
      sections={[
        {
          heading: "A demo, not a service",
          body: (
            <p>
              Wallio was built for the Vultr Agent Rush hackathon. It may change, stop working or be taken down at any
              time, and your guest workspace may be deleted without notice.
            </p>
          ),
        },
        {
          heading: "Sample and synthetic data",
          body: (
            <p>
              Much of what you see is sample data, and it is labelled as such. Trial requests go to a form Wallio owns
              and use synthetic details. No vendor receives them.
            </p>
          ),
        },
        {
          heading: "Not advice",
          body: (
            <p>
              Recommendations are a starting point, not financial or purchasing advice. Check the linked sources before
              you cancel or buy anything. Wallio never does either for you.
            </p>
          ),
        },
        {
          heading: "Don't enter real secrets",
          body: (
            <p>
              Never type passwords, card numbers, API keys or private code into Wallio. It doesn&apos;t need them and
              won&apos;t ask for them.
            </p>
          ),
        },
        {
          heading: "No warranty",
          body: (
            <p>
              Wallio is provided as is, without warranty of any kind. The code is open source under the MIT license.
            </p>
          ),
        },
      ]}
    />
  );
}
