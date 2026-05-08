import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text, InlineStack, Badge, Divider } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const [markets, noteRules, themeSettings] = await Promise.all([
          db.market.findMany({ where: { shop: session.shop }, include: { milestones: true } }),
          db.cartNoteRule.findMany({ where: { shop: session.shop } }),
          db.themeSettings.findUnique({ where: { shop: session.shop } }),
        ]);
    const totalMilestones = markets.reduce((sum, m) => sum + m.milestones.length, 0);
    const activeMarkets = markets.filter((m) => m.enabled).length;
    const activeNoteRules = noteRules.filter((r) => r.enabled).length;
    return json({ markets, totalMilestones, activeMarkets, activeNoteRules, themeSettings });
}

export default function HomePage() {
    const { markets, totalMilestones, activeMarkets, activeNoteRules, themeSettings } = useLoaderData<typeof loader>();
    return (
          <Page title="Ultimate Cart" subtitle="Conversion-optimized cart drawer for Shopify">
                <BlockStack gap="500">
                        <Layout>
                                  <Layout.Section variant="oneThird">
                                              <Card><BlockStack gap="200">
                                                            <Text variant="headingXl" as="p">{markets.length}</Text>Text>
                                                            <Text as="p" tone="subdued">Markets configured</Text>Text>
                                                            <Text as="p" tone={activeMarkets > 0 ? "success" : "subdued"}>{activeMarkets} active</Text>Text>
                                              </BlockStack>BlockStack></Card>Card>
                                  </Layout.Section>Layout.Section>
                                  <Layout.Section variant="oneThird">
                                              <Card><BlockStack gap="200">
                                                            <Text variant="headingXl" as="p">{totalMilestones}</Text>Text>
                                                            <Text as="p" tone="subdued">Total milestones</Text>Text>
                                                            <Text as="p" tone="subdued">across all markets</Text>Text>
                                              </BlockStack>BlockStack></Card>Card>
                                  </Layout.Section>Layout.Section>
                                  <Layout.Section variant="oneThird">
                                              <Card><BlockStack gap="200">
                                                            <Text variant="headingXl" as="p">{activeNoteRules}</Text>Text>
                                                            <Text as="p" tone="subdued">Active note rules</Text>Text>
                                                            <Text as="p" tone={themeSettings ? "success" : "subdued"}>Theme {themeSettings ? "configured" : "using defaults"}</Text>Text>
            </BlockStack>BlockStack></Card>Card>
                                  </Layout.Section>Layout.Section>
                        </Layout>Layout>
                        <Divider />
                        <Card>
                                  <BlockStack gap="400">
                                              <Text variant="headingMd" as="h2">Quick Actions</Text>Text>
                                              <InlineStack gap="300" wrap>
                                                            <Button url="/app/markets" variant="primary">Manage Markets</Button>Button>
                                                            <Button url="/app/notes">Cart Notes</Button>Button>
                                                            <Button url="/app/theme">Customize Theme</Button>Button>
                                                            <Button url="/app/health">Health Check</Button>Button>
                                              </InlineStack>InlineStack>
                                  </BlockStack>BlockStack>
                        </Card>Card>
                  {markets.length > 0 && (
                      <BlockStack gap="300">
                                  <Text variant="headingMd" as="h2">Markets Overview</Text>Text>
                        {markets.map((market) => (
                                      <Card key={market.id}>
                                                      <InlineStack align="space-between" blockAlign="center">
                                                                        <InlineStack gap="300" blockAlign="center">
                                                                                            <Text variant="headingSm" as="h3">{market.flag} {market.name}</Text>Text>
                                                                                            <Badge tone={market.enabled ? "success" : "critical"}>{market.enabled ? "Active" : "Disabled"}</Badge>Badge>
                                                                                            <Text as="span" tone="subdued">{market.milestones.length} milestones</Text>Text>
                                                                        </InlineStack>InlineStack>
                                                                        <Button url={`/app/milestones/${market.code}`} size="slim">Configure</Button>Button>
                                                      </InlineStack>InlineStack>
                                      </Card>Card>
                                    ))}
                      </BlockStack>BlockStack>
                        )}
                  {markets.length === 0 && (
                      <Card>
                                  <BlockStack gap="300">
                                                <Text variant="headingMd" as="h2">Get Started</Text>Text>
                                                <Text as="p" tone="subdued">Add your first market to start configuring milestone rewards.</Text>Text>
                                                <Button url="/app/markets" variant="primary">Add your first market</Button>Button>
                                  </BlockStack>BlockStack>
                      </Card>Card>
                        )}
                </BlockStack>BlockStack>
          </Page>Page>
        );
}</Page>
