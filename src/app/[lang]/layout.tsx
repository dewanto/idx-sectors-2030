import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { dictionaries } from "@/i18n/dict";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!(lang in dictionaries)) redirect("/en");
  return <>{children}</>;
}
