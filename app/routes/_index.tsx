import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Preserve all Shopify query params when redirecting to /app
  return redirect(`/app${url.search}`);
};

export default function Index() {
  return null;
}
