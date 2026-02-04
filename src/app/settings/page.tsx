import { Suspense } from "react";

import SettingsClient from "@/app/settings/SettingsClient";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const { t } = await getServerTranslator();

  return (
    <Suspense fallback={<div className="p-6">{t("common.loading")}</div>}>
      <SettingsClient />
    </Suspense>
  );
}
