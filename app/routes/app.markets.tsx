import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRevalidator } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, Select, Button, TextField,
  Banner, Badge, InlineStack, Divider, RadioButton, Box,
  FormLayout, Toast, Frame, ChoiceList
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ── Shopify GraphQL: fetch all markets with full currency info ───────────────
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
          baseCurrency {
            currencyCode
          }
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Fetch markets from Shopify API (source of truth for currency)
  const response = await admin.graphql(MARKETS_QUERY);
  const result = await response.json();
  const shopifyMarkets = result.data?.markets?.nodes ?? [];

  // For each Shopify market, load or create our settings row
  const marketSettings = await Promise.all(
    shopifyMarkets.map(async (m: any) => {
      const code = m.handle.toUpperCase();
      // baseCurrency is the market's transaction currency — always use this
      // for milestone thresholds (third-party converters only change display)
      const currency = m.currencySettings?.baseCurrency?.currencyCode ?? "USD";
      const currencySymbol = getCurrencySymbol(currency);
      const hasLocalCurrencies = m.currencySettings?.localCurrencies === true;

      let row = await db.market.findUnique({ where: { shop_code: { shop, code } } });
      if (!row) {
        row = await db.market.create({
          data: {
            shop,
            code,
            name: m.name,
            currency,
            flag: "",
            enabled: m.enabled,
            cartEnabled: true,
            progressStyle: "segmented",
            milestoneType: "cart_value",
            allUnlockedMessage: "You have unlocked all rewards!",
            trustBadges: JSON.stringify([]),
          },
        });
      } else if (row.currency !== currency) {
        // Keep currency in sync with Shopify — don't let it drift
        row = await db.market.update({
          where: { id: row.id },
          data: { currency },
        });
      }

      return {
        shopifyId: m.id,
        code,
        name: m.name,
        currency,
        currencySymbol,
        hasLocalCurrencies,
        enabled: m.enabled,
        primary: m.primary,
        dbId: row.id,
        cartEnabled: row.cartEnabled === true || (row.cartEnabled as any) === 1,
        progressStyle: row.progressStyle,
        milestoneType: row.milestoneType,
        allUnlockedMessage: row.allUnlockedMessage,
        trustBadges: (() => {
          try { return JSON.parse(row.trustBadges as string); } catch { return []; }
        })(),
      };
    })
  );

  return json({ markets: marketSettings });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "save_market_settings") {
    const code = form.get("code") as string;
    const cartEnabled = form.get("cartEnabled") === "true";
    const progressStyle = form.get("progressStyle") as string;
    const milestoneType = form.get("milestoneType") as string;
    const allUnlockedMessage = form.get("allUnlockedMessage") as string;
    const trustBadgesRaw = form.get("trustBadges") as string;

    await db.market.updateMany({
      where: { shop, code },
      data: { cartEnabled, progressStyle, milestoneType, allUnlockedMessage, trustBadges: trustBadgesRaw },
    });
    return json({ ok: true, saved: code });
  }

  return json({ ok: false, error: "Unknown intent" });
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  const { markets } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const primaryMarket = markets.find((m) => m.primary) ?? markets[0];
  const [selectedCode, setSelectedCode] = useState<string>(primaryMarket?.code ?? "");
  const [toastActive, setToastActive] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const current = markets.find((m) => m.code === selectedCode);

  const [cartEnabled, setCartEnabled] = useState(() => Boolean(current?.cartEnabled ?? true));
  const [progressStyle, setProgressStyle] = useState(current?.progressStyle ?? "segmented");
  const [milestoneType, setMilestoneType] = useState(current?.milestoneType ?? "cart_value");
  const [allUnlockedMessage, setAllUnlockedMessage] = useState(current?.allUnlockedMessage ?? "");
  const [trustBadgesText, setTrustBadgesText] = useState(
    (current?.trustBadges ?? []).join("\n")
  );

  // Sync fields when market selection changes
  useEffect(() => {
    if (!current) return;
    setCartEnabled(Boolean(current.cartEnabled));
    setProgressStyle(current.progressStyle);
    setMilestoneType(current.milestoneType);
    setAllUnlockedMessage(current.allUnlockedMessage);
    setTrustBadgesText((current.trustBadges ?? []).join("\n"));
  }, [selectedCode]);

  const handleSave = useCallback(() => {
    if (!current) return;
    const badges = trustBadgesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const fd = new FormData();
    fd.append("intent", "save_market_settings");
    fd.append("code", selectedCode);
    fd.append("cartEnabled", String(cartEnabled));
    fd.append("progressStyle", progressStyle);
    fd.append("milestoneType", milestoneType);
    fd.append("allUnlockedMessage", allUnlockedMessage);
    fd.append("trustBadges", JSON.stringify(badges));
    submit(fd, { method: "post" });
    setToastMsg(`Settings saved for ${current.name}!`);
    setToastActive(true);
  }, [current, selectedCode, cartEnabled, progressStyle, milestoneType, allUnlockedMessage, trustBadgesText, submit]);

  const isSaving = navigation.state === "submitting";

  if (markets.length === 0) {
    return (
      <Page title="Markets">
        <Banner title="No markets found" tone="warning">
          <Text as="p">No active markets found. Go to Settings → Markets in Shopify Admin to set up markets.</Text>
        </Banner>
      </Page>
    );
  }

  const marketOptions = markets.map((m) => ({
    label: `${m.name} (${m.currency})${m.primary ? " — Primary" : ""}`,
    value: m.code,
  }));

  return (
    <Frame>
      <Page
        title="Market Settings"
        subtitle="Configure the cart drawer independently for each market"
        primaryAction={{
          content: isSaving ? "Saving…" : "Save Settings",
          onAction: handleSave,
          loading: isSaving,
          disabled: !current,
        }}
      >
        {toastActive && (
          <Toast content={toastMsg} onDismiss={() => setToastActive(false)} duration={3000} />
        )}
        <Layout>

          {/* ── Market Selector ── */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Select Market</Text>
                <Select
                  label="Market"
                  options={marketOptions}
                  value={selectedCode}
                  onChange={(val) => setSelectedCode(val)}
                  helpText="Choose a market to configure its cart drawer settings"
                />
                {current && (
                  <InlineStack gap="200" align="start" wrap>
                    <Badge tone={current.enabled ? "success" : "subdued"}>
                      {current.enabled ? "Active in Shopify" : "Inactive in Shopify"}
                    </Badge>
                    {current.primary && <Badge tone="info">Primary Market</Badge>}
                    <Badge tone="attention">
                      Base Currency: {current.currency} ({current.currencySymbol})
                    </Badge>
                    {current.hasLocalCurrencies && (
                      <Badge tone="warning">Uses local currency display</Badge>
                    )}
                  </InlineStack>
                )}
                {current?.hasLocalCurrencies && (
                  <Banner tone="info">
                    <Text as="p">
                      This market uses local currencies for display. Milestone thresholds are always evaluated
                      in the base currency ({current.currency}) — this is what Shopify uses for cart calculations,
                      regardless of any third-party currency converter your store may use.
                    </Text>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {current && (
            <>
              {/* ── Cart Drawer Toggle ── */}
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">Cart Drawer</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Control whether Ultimate Cart is active for this market
                        </Text>
                      </BlockStack>
                      <Badge tone={cartEnabled ? "success" : "critical"}>
                        {cartEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </InlineStack>
                    <Divider />
                    <ChoiceList
                      title="Cart drawer behaviour for this market"
                      choices={[
                        {
                          label: "Enable Ultimate Cart drawer",
                          helpText: "Your custom cart drawer with milestones, trust badges, and upsells will be shown.",
                          value: "enabled",
                        },
                        {
                          label: "Disable — show original theme cart",
                          helpText: "Customers in this market will see your theme's default cart. All settings are preserved and can be re-enabled at any time.",
                          value: "disabled",
                        },
                      ]}
                      selected={[cartEnabled ? "enabled" : "disabled"]}
                      onChange={(val) => setCartEnabled(val[0] === "enabled")}
                    />
                    {!cartEnabled && (
                      <Banner tone="warning">
                        <Text as="p">
                          The cart drawer is <strong>disabled</strong> for {current.name}. Customers in this market will see the original theme cart.
                          Milestone and trust badge settings are saved but will not be displayed.
                        </Text>
                      </Banner>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* ── Milestone Progress Bar (only shown if enabled) ── */}
              {cartEnabled && (
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Milestone Progress Bar</Text>
                      <Divider />
                      <FormLayout>
                        <BlockStack gap="300">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">Progress Bar Style</Text>
                          <InlineStack gap="400">
                            <RadioButton
                              label="Segmented"
                              helpText="Separate filled segments per milestone"
                              checked={progressStyle === "segmented"}
                              id="segmented"
                              name="progressStyle"
                              onChange={() => setProgressStyle("segmented")}
                            />
                            <RadioButton
                              label="Sequential"
                              helpText="Single continuous bar"
                              checked={progressStyle === "sequential"}
                              id="sequential"
                              name="progressStyle"
                              onChange={() => setProgressStyle("sequential")}
                            />
                          </InlineStack>
                        </BlockStack>

                        <BlockStack gap="300">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">Milestone Trigger Type</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Applies to all milestones in this market. Thresholds are always in {current.currency} (base currency).
                          </Text>
                          <InlineStack gap="400">
                            <RadioButton
                              label={`Cart Value (${current.currency})`}
                              helpText={`Trigger based on cart subtotal in ${current.currency}`}
                              checked={milestoneType === "cart_value"}
                              id="cart_value"
                              name="milestoneType"
                              onChange={() => setMilestoneType("cart_value")}
                            />
                            <RadioButton
                              label="Item Count"
                              helpText="Trigger based on number of items in cart"
                              checked={milestoneType === "item_count"}
                              id="item_count"
                              name="milestoneType"
                              onChange={() => setMilestoneType("item_count")}
                            />
                          </InlineStack>
                        </BlockStack>

                        <TextField
                          label="All Milestones Unlocked Message"
                          value={allUnlockedMessage}
                          onChange={setAllUnlockedMessage}
                          placeholder="You have unlocked all rewards!"
                          helpText="Shown when all milestones have been reached"
                          autoComplete="off"
                        />
                      </FormLayout>
                      <Box paddingBlockStart="200">
                        <Button variant="secondary" url={`/app/milestones/${current.code}`}>
                          Configure Milestones for {current.name} →
                        </Button>
                      </Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              )}

              {/* ── Trust Badges (only shown if enabled) ── */}
              {cartEnabled && (
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Trust Badges</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Short text strings shown above the checkout button. One badge per line.
                      </Text>
                      <TextField
                        label="Trust Badges (one per line)"
                        value={trustBadgesText}
                        onChange={setTrustBadgesText}
                        multiline={4}
                        placeholder={"Free shipping on orders above ₹999\n100% secure checkout\nEasy 30-day returns"}
                        autoComplete="off"
                      />
                    </BlockStack>
                  </Card>
                </Layout.Section>
              )}
            </>
          )}
        </Layout>
      </Page>
    </Frame>
  );
}
