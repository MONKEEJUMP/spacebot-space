import { redirect } from "next/navigation";
import { getSafeHumanRedirect } from "@/lib/navigation/safe-human-redirect";

export default async function LoginCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect?: string | string[];
    redirect_url?: string | string[];
    from?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const requested = query.redirect_url ?? query.redirect ?? query.from;
  const requestedPath = Array.isArray(requested) ? requested[0] : requested;
  const returnPath = getSafeHumanRedirect(requestedPath, "/peoplespace");

  redirect(`/sign-in?redirect_url=${encodeURIComponent(returnPath)}`);
}
