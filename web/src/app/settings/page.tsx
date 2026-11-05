import { PageHeader } from "@/components/kit/page-header";
import { Panel } from "@/components/kit/panel";
import { KeyValue, KeyValueRow } from "@/components/kit/key-value";
import { Tag } from "@/components/kit/tag";

export const metadata = { title: "Settings · Wallio" };

// TODO(api): GET /api/settings. Export and delete map to POST /api/privacy/export and DELETE /api/account.
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Settings"
        subtitle="Your account, connections, and data."
      />

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 xl:col-span-6">
          <Panel title="Account" flush>
            <KeyValue className="border-t border-line">
              <KeyValueRow label="Name">Abhi</KeyValueRow>
              <KeyValueRow label="Monthly budget">$120</KeyValueRow>
              <KeyValueRow label="Currency">USD</KeyValueRow>
              <KeyValueRow label="Change alerts">Weekly digest</KeyValueRow>
            </KeyValue>
          </Panel>
        </div>

        <div className="col-span-12 xl:col-span-6">
          <Panel title="Connections" flush>
            <KeyValue className="border-t border-line">
              <KeyValueRow label="GitHub">
                <span className="text-text-3">Not connected</span>
              </KeyValueRow>
              <KeyValueRow label="Billing import">
                <span className="text-text-3">Not connected</span>
              </KeyValueRow>
              <KeyValueRow label="Data shown">
                <Tag kind="sample" />
              </KeyValueRow>
            </KeyValue>
          </Panel>
        </div>

        <div className="col-span-12">
          <Panel title="Your data" flush>
            <KeyValue className="border-t border-line">
              <KeyValueRow label="Screenshots and traces">
                Kept 7 days
              </KeyValueRow>
              <KeyValueRow label="Reports">Kept 90 days</KeyValueRow>
              <KeyValueRow label="Saved decisions">
                Kept until you delete them
              </KeyValueRow>
              <KeyValueRow label="Export everything">
                <span className="text-text-3">Coming soon</span>
              </KeyValueRow>
              <KeyValueRow label="Delete account">
                <span className="text-text-3">Coming soon</span>
              </KeyValueRow>
            </KeyValue>
          </Panel>
        </div>
      </div>
    </div>
  );
}
