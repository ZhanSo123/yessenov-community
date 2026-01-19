import { Suspense } from "react";

import OnboardingClient from "./OnboardingClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <OnboardingClient />
    </Suspense>
  );
}
