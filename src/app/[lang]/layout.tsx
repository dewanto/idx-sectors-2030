import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { dictionaries, type Locale } from "@/i18n/dict";
import OnboardingTour from "@/components/OnboardingTour";
import { getTourTicker } from "@/db/queries";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!(lang in dictionaries)) redirect("/en");
  /* One cheap query per request: the ticker the onboarding tour uses for its
     "Company File" stop. Falls back to null (tour degrades gracefully). */
  const ticker = await getTourTicker();
  return (
    <>
      {children}
      <OnboardingTour locale={lang as Locale} ticker={ticker} />
    </>
  );
}