import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Allow CORS for storefront calls
  const origin = request.headers.get("Origin") || "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? null;
  const marketParam = url.searchParams.get("market") || "primary";

  // Try to get shop from session if not in query
  let shopDomain = shop;
  if (!shopDomain) {
    try {
      const { session } = await authenticate.public.appProxy(request);
      shopDomain = session?.shop ?? null;
    } catch {
      // For direct API calls from storefront, shop may be in referer
      const referer = request.headers.get("Referer") || "";
      const match = referer.match(/https?:\/\/([^/]+)/);
      if (match) shopDomain = match[1] ?? null;
    }
  }

  if (!shopDomain) {
    return json({ error: "shop required" }, { status: 400, headers: corsHeaders });
  }

  try {
    // Get market config
    const market = await db.market.findFirst({
      where: { shop: shopDomain, OR: [{ code: marketParam }, { name: { contains: marketParam } }] },
    });

    const effectiveMarket = market || await db.market.findFirst({
      where: { shop: shopDomain },
    });

    // Get milestones
    const milestones = effectiveMarket
      ? await db.milestone.findMany({
          where: { marketId: effectiveMarket.id },
          orderBy: { threshold: "asc" },
        })
      : [];

    // Get cart note rules
    const noteRules = await db.cartNoteRule.findMany({
      where: { shop: shopDomain, enabled: true },
      orderBy: { sortOrder: "asc" },
    });

    // Get theme settings
    const theme = await db.themeSettings.findFirst({
      where: { shop: shopDomain },
    });

    // Get upsell products (stored in UpsellProduct model)
    let upsells: any[] = [];
    try {
      upsells = await (db as any).upsellProduct.findMany({
        where: { shop: shopDomain },
        orderBy: { sortOrder: "asc" },
        take: 10,
      });
    } catch {
      upsells = [];
    }

    const config = {
      milestones: milestones.map((m: any) => ({
        threshold: m.threshold,
        label: m.reward || m.rewardType || "Reward",
        rewardType: m.rewardType,
        rewardValue: m.rewardValue,
      })),
      triggerType: effectiveMarket?.milestoneType || "cartValue",
      barStyle: effectiveMarket?.progressStyle || "sequential",
      allUnlockedMessage: effectiveMarket?.allUnlockedMessage || null,
      currency: effectiveMarket?.currency || null,
      cartEnabled: effectiveMarket?.cartEnabled !== false,
      trustBadge: effectiveMarket?.trustBadges || null,
      noteRules: noteRules.map((r: any) => ({
        id: r.id,
        trigger: r.trigger,
        selectedProducts: r.selectedProducts ? JSON.parse(r.selectedProducts) : [],
        selectedVariants: r.selectedVariants ? JSON.parse(r.selectedVariants) : [],
        prompt: r.prompt,
        placeholder: r.placeholder,
        required: r.required,
        enabled: r.enabled,
      })),
      theme: theme
        ? {
            accentColor: theme.accentColor,
            btnBg: theme.accentColor,
            btnColor: theme.textColor,
            bgColor: theme.bgColor,
            headingFont: theme.headingFont,
            bodyFont: theme.bodyFont,
          }
        : null,
      upsells: upsells.map((u: any) => ({
        productId: u.productId,
        title: u.productTitle,
        image: u.imageUrl,
        handle: u.productHandle,
      })),
    };

    return json(config, { headers: corsHeaders });
  } catch (error) {
    console.error("api.cart-config error:", error);
    return json({ error: "Failed to load config", milestones: [], noteRules: [], upsells: [] }, { status: 500, headers: corsHeaders });
  }
}

export async function action({ request }: LoaderFunctionArgs) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
  return json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
}
