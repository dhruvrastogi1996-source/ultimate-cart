/**
 * Public API endpoint for the cart drawer extension (storefront JS).
 * Called as: GET /api/market-config?shop=mystore.myshopify.com&market=IN
 *
 * Returns per-market config including cartEnabled so the cart drawer
 * knows whether to activate or fall through to the OG cart.
 *
 * No auth required — data is non-sensitive merchant config.
 * CORS headers allow calls from the storefront domain.
 */
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const marketHandle = url.searchParams.get("market") ?? "";
  const marketCode = marketHandle.toUpperCase();

  // CORS — allow the storefront to call this
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60", // cache 60s on CDN
  };

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400, headers });
  }

  // Fetch market row
  const marketRow = await db.market.findUnique({
    where: { shop_code: { shop, code: marketCode } },
    include: {
      milestones: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!marketRow) {
    // Market not configured — default to enabled (safe fallback)
    return json({
      cartEnabled: true,
      configured: false,
      market: marketCode,
      currency: "USD",
      progressStyle: "segmented",
      milestoneType: "cart_value",
      allUnlockedMessage: "",
      trustBadges: [],
      milestones: [],
    }, { headers });
  }

  const trustBadges = (() => {
    try { return JSON.parse(marketRow.trustBadges as string); } catch { return []; }
  })();

  return json({
    cartEnabled: marketRow.cartEnabled,
    configured: true,
    market: marketCode,
    currency: marketRow.currency,
    progressStyle: marketRow.progressStyle,
    milestoneType: marketRow.milestoneType,
    allUnlockedMessage: marketRow.allUnlockedMessage,
    trustBadges,
    milestones: marketRow.milestones.map((m) => ({
      id: m.id,
      threshold: m.threshold,
      reward: m.reward,
      rewardType: m.rewardType,
      discountPct: m.discountPct,
      fixedDiscount: m.fixedDiscount,
      icon: m.icon,
    })),
  }, { headers });
};

// Handle CORS preflight
export const action = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return json({ error: "Method not allowed" }, { status: 405 });
};
