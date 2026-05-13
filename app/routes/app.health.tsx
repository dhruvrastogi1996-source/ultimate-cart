import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge,
  Banner, DataTable, Divider, List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const DISCOUNTS_QUERY = `#graphql
  query GetAutomaticDiscounts {
    automaticDiscountNodes(first: 50) {
      edges {
        node {
          id
          automaticDiscount {
            ... on DiscountAutomaticBasic {
              title
              status
              customerGets {
                value {
                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

type DiscountNode = {
  id: string;
  title: string;
  status: string;
  percentage?: number;
  amount?: number;
  currency?: string;
};

type MilestoneCheck = {
  marketName: string;
  marketFlag: string;
  threshold: number;
  currency: string;
  rewardType: string;
  discountPct: number;
  fixedDiscount: number;
  reward: string;
  matched: boolean;
  discountTitle?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const markets = await db.market.findMany({
    where: { shop },
    include: { milestones: { where: { enabled: true, rewardType: { not: "none" } } } },
  });

  let shopifyDiscounts: DiscountNode[] = [];
  try {
    const res = await admin.graphql(DISCOUNTS_QUERY);
    const data = await res.json();
    shopifyDiscounts = data.data.automaticDiscountNodes.edges
      .map((e: any) => {
        const d = e.node.automaticDiscount;
        if (!d) return null;
        const val = d.customerGets?.value;
        return {
          id: e.node.id,
          title: d.title || "",
          status: d.status || "INACTIVE",
          percentage: val?.percentage ? Math.round(val.percentage * 100) : undefined,
          amount: val?.amount?.amount ? parseFloat(val.amount.amount) : undefined,
          currency: val?.amount?.currencyCode,
        };
      })
      .filter(Boolean);
  } catch (e) {
    // If query fails (e.g. permissions), proceed with empty list
  }

  const checks: MilestoneCheck[] = [];
  for (const market of markets) {
    for (const ms of market.milestones) {
      const matched = shopifyDiscounts.some((d) => {
        if (d.status !== "ACTIVE") return false;
        if (ms.rewardType === "percent_off") return d.percentage === ms.discountPct;
        if (ms.rewardType === "flat_off") return d.amount === ms.fixedDiscount;
        return false;
      });
      const matchedDiscount = shopifyDiscounts.find((d) => {
        if (ms.rewardType === "percent_off") return d.percentage === ms.discountPct;
        if (ms.rewardType === "flat_off") return d.amount === ms.fixedDiscount;
        return false;
      });
      checks.push({
        marketName: market.name,
        marketFlag: market.flag || "",
        threshold: ms.threshold,
        currency: market.currency,
        rewardType: ms.rewardType,
        discountPct: ms.discountPct,
        fixedDiscount: ms.fixedDiscount,
        reward: ms.reward,
        matched,
        discountTitle: matchedDiscount?.title,
      });
    }
  }

  return json({ checks, shopifyDiscounts, hasIssues: checks.some((c) => !c.matched) });
};

export default function HealthPage() {
  const { checks, shopifyDiscounts, hasIssues } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = checks.map((c) => [
    `${c.marketFlag} ${c.marketName}`,
    c.rewardType === "percent_off"
      ? `${c.discountPct}% off at ${c.currency} ${c.threshold}`
      : `${c.currency} ${c.fixedDiscount} off at ${c.currency} ${c.threshold}`,
    c.reward,
    c.matched
      ? <Badge tone="success">✓ Matched: {c.discountTitle}</Badge>
      : <InlineStack gap="200">
          <Badge tone="critical">✗ No matching discount</Badge>
          <Button size="slim" variant="plain" url={`https://admin.shopify.com/store/settings/discounts/new`} external>Fix</Button>
        </InlineStack>,
  ]);

  return (
    <Page
      title="Health Check"
      subtitle="Verify that milestone discounts have matching Shopify automatic discounts"
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{ content: "Refresh", onAction: () => navigate("/app/health") }}
    >
      <Layout>
        <Layout.Section>
          {checks.length === 0 ? (
            <Banner tone="info">
              <Text as="p">No milestone discounts configured yet. Add milestones with % Off or Flat Off rewards to see health check results.</Text>
            </Banner>
          ) : hasIssues ? (
            <Banner tone="warning">
              <Text as="p">Some milestones are missing matching Shopify automatic discounts. Customers will see slashed prices in the cart but won't get the actual discount at checkout until you create matching discounts.</Text>
            </Banner>
          ) : (
            <Banner tone="success">
              <Text as="p">All milestone discounts have matching active Shopify automatic discounts. Your cart drawer and checkout are in sync!</Text>
            </Banner>
          )}
        </Layout.Section>

        {checks.length > 0 && (
          <Layout.Section>
            <Card padding="0">
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Market", "Milestone", "Reward Label", "Shopify Discount Status"]}
                rows={rows}
              />
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">How to Create Matching Shopify Discounts</Text>
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                Ultimate Cart visually slashes prices in the cart drawer when milestones are hit.
                For the actual discount to apply at checkout, you need matching automatic discounts in Shopify.
              </Text>
              <List type="number">
                <List.Item>Go to <strong>Shopify Admin → Discounts</strong> and click "Create discount"</List.Item>
                <List.Item>Choose <strong>"Automatic discount"</strong> → Amount off order</List.Item>
                <List.Item>Set the discount value to match your milestone (e.g., 10% off or ₹200 off)</List.Item>
                <List.Item>Set minimum purchase requirements to match the milestone threshold (e.g., minimum cart value of ₹1,000)</List.Item>
              </List>
              <Button url="https://admin.shopify.com/store/settings/discounts/new" external variant="primary">
                Create Shopify Discount →
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {shopifyDiscounts.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">All Active Shopify Automatic Discounts</Text>
                <Divider />
                {shopifyDiscounts.map((d) => (
                  <InlineStack key={d.id} align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm">{d.title}</Text>
                    <InlineStack gap="200">
                      {d.percentage && <Badge>{d.percentage}% off</Badge>}
                      {d.amount && <Badge>{d.currency} {d.amount} off</Badge>}
                      <Badge tone={d.status === "ACTIVE" ? "success" : "attention"}>{d.status}</Badge>
                    </InlineStack>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
