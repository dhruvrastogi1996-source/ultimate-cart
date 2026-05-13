import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, Button, TextField,
  Select, InlineStack, Badge, Divider, Banner, Box,
  Toast, Frame, ButtonGroup, EmptyState
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const MARKETS_QUERY = `
  query GetMarkets {
    markets(first: 50) {
      nodes {
        id
        name
        handle
        enabled
        primary
        currencySettings {
          baseCurrency { currencyCode }
          localCurrencies
        }
      }
    }
  }
`;

// Derive a display symbol from the ISO currency code
function getCurrencySymbol(code: string): string {
  try {
    return (0).toLocaleString("en", { style: "currency", currency: code, minimumFractionDigits: 0 })
      .replace(/[\d\s,.]/g, "").trim() || code;
  } catch {
    return code;
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const marketCode = (params.marketCode ?? "").toUpperCase();

  const res = await admin.graphql(MARKETS_QUERY);
  const result = await res.json();
  const shopifyMarkets = result.data?.markets?.nodes ?? [];

  const allMarkets = shopifyMarkets.map((m: any) => ({
    code: m.handle.toUpperCase(),
    name: m.name,
    currency: m.currencySettings?.baseCurrency?.currencyCode ?? "USD",
    currencySymbol: getCurrencySymbol(m.currencySettings?.baseCurrency?.currencyCode ?? 'USD'),
    primary: m.primary,
    enabled: m.enabled,
  }));

  const currentMarket = allMarkets.find((m: any) => m.code === marketCode) ?? allMarkets[0];
  const activeCode = currentMarket?.code ?? marketCode;

  let marketRow = await db.market.findUnique({ where: { shop_code: { shop, code: activeCode } } });
  if (!marketRow && currentMarket) {
    marketRow = await db.market.create({
      data: {
        shop, code: activeCode, name: currentMarket.name,
        currency: currentMarket.currency, flag: "",
        enabled: currentMarket.enabled,
        cartEnabled: true,
        progressStyle: "segmented", milestoneType: "cart_value",
        allUnlockedMessage: "You have unlocked all rewards!",
        trustBadges: JSON.stringify([]),
      },
    });
  }

  const milestones = marketRow
    ? await db.milestone.findMany({
        where: { marketId: marketRow.id },
        orderBy: { sortOrder: "asc" },
      })
    : [];

  return json({
    allMarkets,
    currentMarket: currentMarket ?? null,
    marketRow: marketRow ? {
      id: marketRow.id,
      milestoneType: marketRow.milestoneType,
      currency: marketRow.currency ?? currentMarket?.currency ?? "USD",
      currencySymbol: currentMarket?.currencySymbol ?? "$",
      cartEnabled: marketRow.cartEnabled,
    } : null,
    milestones,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const marketCode = (params.marketCode ?? "").toUpperCase();

  let marketRow = await db.market.findUnique({ where: { shop_code: { shop, code: marketCode } } });
  if (!marketRow) {
    return json({ ok: false, error: "Market not found" }, { status: 404 });
  }

  if (intent === "save_all_milestones") {
    const milestonesJson = form.get("milestones") as string;
    const milestones = JSON.parse(milestonesJson);

    for (const m of milestones) {
      if (m.id.startsWith("new_")) {
        await db.milestone.create({
          data: {
            marketId: marketRow.id,
            threshold: m.threshold,
            reward: m.reward,
            rewardType: m.rewardType,
            discountPct: m.discountPct,
            fixedDiscount: m.fixedDiscount,
            icon: m.icon,
            enabled: m.enabled,
            sortOrder: m.sortOrder,
          },
        });
      } else {
        await db.milestone.update({
          where: { id: m.id },
          data: {
            threshold: m.threshold,
            reward: m.reward,
            rewardType: m.rewardType,
            discountPct: m.discountPct,
            fixedDiscount: m.fixedDiscount,
            icon: m.icon,
            enabled: m.enabled,
            sortOrder: m.sortOrder,
          },
        });
      }
    }
  // Sync all milestones to shop metafield for Shopify Function access
  try {
    const allMS = await db.milestone.findMany({ where: { marketId: marketRow.id } });
    const mfValue = JSON.stringify(allMS.map((m: any) => ({
      threshold: Number(m.threshold),
      discountPct: Number(m.discountPct),
      rewardType: m.rewardType,
    })));
    const METAFIELD_MUTATION = `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;
    const { admin: adminClient } = await authenticate.admin(request);
    const shopResp = await adminClient.graphql(`#graphql
      query { shop { id } }
    `);
    const shopData = await shopResp.json();
    const shopGid = shopData?.data?.shop?.id ?? "";
    if (shopGid) {
      await adminClient.graphql(METAFIELD_MUTATION, {
        variables: {
          metafields: [{
            ownerId: shopGid,
            namespace: "ultimate_cart",
            key: "milestones",
            type: "json",
            value: mfValue,
          }]
        }
      });
    }
  } catch (syncErr) {
    console.error("Metafield sync failed:", syncErr);
  }
    return json({ ok: true });
  }

  if (intent === "delete_milestone_by_id") {
    const id = form.get("id") as string;
    if (!id.startsWith("new_")) {
      await db.milestone.delete({ where: { id } });
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" });
};

type MilestoneLocal = {
  id: string;
  threshold: number;
  reward: string;
  rewardType: string;
  discountPct: number;
  fixedDiscount: number;
  icon: string;
  enabled: boolean;
  sortOrder: number;
};

const ICON_OPTIONS = [
  { label: "🚚 Free Shipping", value: "truck" },
  { label: "🎁 Gift", value: "gift" },
  { label: "⭐ Star", value: "star" },
  { label: "🏷️ Tag", value: "tag" },
  { label: "✨ Sparkle", value: "sparkle" },
  { label: "🔥 Fire", value: "fire" },
  { label: "💎 Diamond", value: "diamond" },
  { label: "🎉 Party", value: "party" },
];

const REWARD_TYPE_OPTIONS = [
  { label: "No Discount (e.g. Free Shipping)", value: "none" },
  { label: "% Off", value: "percent_off" },
  { label: "Flat Off", value: "flat_off" },
];

export default function MilestonesPage() {
  const { allMarkets, currentMarket, marketRow, milestones: savedMilestones } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const [localMilestones, setLocalMilestones] = useState<MilestoneLocal[]>(
    savedMilestones.map((m) => ({
      id: m.id, threshold: m.threshold, reward: m.reward,
      rewardType: m.rewardType, discountPct: m.discountPct,
      fixedDiscount: m.fixedDiscount, icon: m.icon ?? "truck",
      enabled: m.enabled, sortOrder: m.sortOrder,
    }))
  );
  const [toastActive, setToastActive] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setLocalMilestones(
      savedMilestones.map((m) => ({
        id: m.id, threshold: m.threshold, reward: m.reward,
        rewardType: m.rewardType, discountPct: m.discountPct,
        fixedDiscount: m.fixedDiscount, icon: m.icon ?? "truck",
        enabled: m.enabled, sortOrder: m.sortOrder,
      }))
    );
  }, [savedMilestones]);

  const updateMilestone = useCallback((id: string, field: keyof MilestoneLocal, value: any) => {
    setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  }, []);

  const addMilestone = useCallback(() => {
    const newId = `new_${Date.now()}`;
    setLocalMilestones((prev) => [
      ...prev,
      { id: newId, threshold: 500, reward: "Free Shipping", rewardType: "none",
        discountPct: 0, fixedDiscount: 0, icon: "truck", enabled: true, sortOrder: prev.length },
    ]);
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setLocalMilestones((prev) => prev.filter((m) => m.id !== id));
    if (!id.startsWith("new_")) {
      const fd = new FormData();
      fd.append("intent", "delete_milestone_by_id");
      fd.append("id", id);
      submit(fd, { method: "post" });
    }
  }, [submit]);

  const saveAll = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "save_all_milestones");
    fd.append("milestones", JSON.stringify(localMilestones.map((m, i) => ({ ...m, sortOrder: i }))));
    submit(fd, { method: "post" });
    setToastMsg("Milestones saved!");
    setToastActive(true);
  }, [localMilestones, submit]);

  const currency = marketRow?.currency ?? currentMarket?.currency ?? "USD";
  const currencySymbol = marketRow?.currencySymbol ?? currentMarket?.currencySymbol ?? "$";
  const milestoneType = marketRow?.milestoneType ?? "cart_value";
  const cartEnabled = marketRow?.cartEnabled ?? true;
  const thresholdLabel = milestoneType === "cart_value" ? `Threshold (${currency})` : "Threshold (items)";
  const thresholdSuffix = milestoneType === "cart_value" ? currency : "items";

  if (!currentMarket) {
    return (
      <Page title="Milestones">
        <Banner title="Market not found" tone="critical">
          <Text as="p">The market you are looking for does not exist.</Text>
        </Banner>
      </Page>
    );
  }

  const marketSelectOptions = allMarkets.map((m: any) => ({
    label: `${m.name} (${m.currency})${m.primary ? " — Primary" : ""}`,
    value: m.code,
  }));

  return (
    <Frame>
      <Page
        title={`Milestones — ${currentMarket.name}`}
        subtitle={`Milestone thresholds are in ${currency} (Shopify base currency)`}
        backAction={{ content: "Market Settings", url: "/app/markets" }}
        primaryAction={cartEnabled ? {
          content: isSaving ? "Saving…" : "Save All Milestones",
          onAction: saveAll,
          loading: isSaving,
        } : undefined}
        secondaryActions={cartEnabled ? [
          { content: "Add Milestone", onAction: addMilestone, icon: PlusIcon },
        ] : undefined}
      >
        {toastActive && (
          <Toast content={toastMsg} onDismiss={() => setToastActive(false)} duration={3000} />
        )}

        <Layout>
          {/* Market switcher */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Market</Text>
                <Select
                  label="Switch Market"
                  options={marketSelectOptions}
                  value={currentMarket.code}
                  onChange={(val) => navigate(`/app/milestones/${val}`)}
                  helpText="Switch to configure milestones for a different market"
                />
                <InlineStack gap="200" wrap>
                  <Badge tone="info">
                    Trigger: {milestoneType === "cart_value" ? `Cart Value (${currency})` : "Item Count"}
                  </Badge>
                  <Badge tone={cartEnabled ? "success" : "critical"}>
                    Cart Drawer: {cartEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Change trigger type and cart drawer status in Market Settings
                  </Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Disabled warning */}
          {!cartEnabled && (
            <Layout.Section>
              <Banner
                title="Cart drawer is disabled for this market"
                tone="warning"
                action={{ content: "Go to Market Settings", url: "/app/markets" }}
              >
                <Text as="p">
                  The cart drawer is disabled for {currentMarket.name}. Customers will see the original
                  theme cart. You can still configure milestones here — they will become active
                  when you re-enable the cart drawer.
                </Text>
              </Banner>
            </Layout.Section>
          )}

          {/* Milestones */}
          <Layout.Section>
            {localMilestones.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No milestones yet"
                  action={cartEnabled ? { content: "Add First Milestone", onAction: addMilestone } : undefined}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p">
                    {cartEnabled
                      ? "Add milestones to encourage customers to spend more."
                      : "Enable the cart drawer for this market first, then add milestones."}
                  </Text>
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="400">
                {localMilestones.map((m, idx) => (
                  <Card key={m.id}>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <InlineStack gap="200" align="center">
                          <Text as="h3" variant="headingMd">Milestone {idx + 1}</Text>
                          <Badge tone={m.enabled ? "success" : "subdued"}>
                            {m.enabled ? "Active" : "Disabled"}
                          </Badge>
                          {m.id.startsWith("new_") && <Badge tone="attention">Unsaved</Badge>}
                        </InlineStack>
                        <ButtonGroup>
                          <Button
                            tone="critical" variant="plain" icon={DeleteIcon}
                            onClick={() => removeMilestone(m.id)}
                          >
                            Remove
                          </Button>
                        </ButtonGroup>
                      </InlineStack>

                      <Divider />

                      <InlineStack gap="400" wrap={false} align="start">
                        <Box minWidth="160px">
                          <TextField
                            label={thresholdLabel}
                            type="number"
                            value={String(m.threshold)}
                            onChange={(val) => updateMilestone(m.id, "threshold", parseFloat(val) || 0)}
                            suffix={thresholdSuffix}
                            autoComplete="off"
                            min={0}
                          />
                        </Box>
                        <Box minWidth="200px">
                          <TextField
                            label="Reward Label"
                            value={m.reward}
                            onChange={(val) => updateMilestone(m.id, "reward", val)}
                            placeholder="Free Shipping"
                            autoComplete="off"
                          />
                        </Box>
                        <Box minWidth="160px">
                          <Select
                            label="Icon"
                            options={ICON_OPTIONS}
                            value={m.icon}
                            onChange={(val) => updateMilestone(m.id, "icon", val)}
                          />
                        </Box>
                      </InlineStack>

                      <BlockStack gap="300">
                        <Select
                          label="Reward Type"
                          options={REWARD_TYPE_OPTIONS}
                          value={m.rewardType}
                          onChange={(val) => updateMilestone(m.id, "rewardType", val)}
                          helpText="How the discount applies when this milestone is reached"
                        />
                        {m.rewardType === "percent_off" && (
                          <TextField
                            label="Discount Percentage"
                            type="number"
                            value={String(m.discountPct)}
                            onChange={(val) => updateMilestone(m.id, "discountPct", parseFloat(val) || 0)}
                            suffix="%" autoComplete="off" min={0} max={100}
                            helpText="Requires a matching automatic discount in Shopify Admin → Discounts"
                          />
                        )}
                        {m.rewardType === "flat_off" && (
                          <TextField
                            label={`Flat Discount (${currency})`}
                            type="number"
                            value={String(m.fixedDiscount)}
                            onChange={(val) => updateMilestone(m.id, "fixedDiscount", parseFloat(val) || 0)}
                            prefix={currencySymbol} autoComplete="off" min={0}
                            helpText="Requires a matching automatic discount in Shopify Admin → Discounts"
                          />
                        )}
                      </BlockStack>

                      <InlineStack gap="300" align="start">
                        <Button
                          variant={m.enabled ? "secondary" : "primary"} size="slim"
                          onClick={() => updateMilestone(m.id, "enabled", !m.enabled)}
                        >
                          {m.enabled ? "Disable" : "Enable"}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Card>
                ))}

                {cartEnabled && (
                  <InlineStack align="center">
                    <Button variant="secondary" icon={PlusIcon} onClick={addMilestone}>
                      Add Another Milestone
                    </Button>
                  </InlineStack>
                )}
              </BlockStack>
            )}
          </Layout.Section>

          <Layout.Section>
            <Banner tone="info" title="How milestone discounts work">
              <Text as="p">
                For % Off and Flat Off rewards, create matching automatic discounts in Shopify Admin → Discounts.
                The cart drawer shows the visual progress bar — Shopify handles the actual discount at checkout.
                Threshold values are always in {currency} (the base currency for this market).
              </Text>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
