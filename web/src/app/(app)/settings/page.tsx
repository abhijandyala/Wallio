import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Settings · Wallio" };

// TODO(api): GET/PATCH /api/settings, POST /api/privacy/export, DELETE /api/account.
export default function SettingsPage() {
  return <SettingsView />;
}
