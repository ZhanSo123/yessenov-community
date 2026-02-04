import { Suspense } from "react";

import AuthClient from "@/app/auth/AuthClient";
import { getServerTranslator } from "@/lib/i18n/server";

export default async function AuthLandingPage() {
  const { t } = await getServerTranslator();

  return (
    <Suspense fallback={<div className="p-6">{t("common.loading")}</div>}>
      <AuthClient />
    </Suspense>
  );
}
