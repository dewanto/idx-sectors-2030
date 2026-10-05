import { redirect } from "next/navigation";

/* Bare root — the middleware also redirects, this is the server-side fallback. */
export default function RootPage() {
  redirect("/en");
}
