import { Suspense } from "react";

import SettingsClient from "@/app/settings/SettingsClient";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <SettingsClient />
    </Suspense>
  );
}
