import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
  import {
  Page, Card, BlockStack, Button, Text, InlineStack,
      Banner, Badge, Divider, List
    } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
  import db from "../db.server";

const DISCOUNTS_QUERY = `
  query GetAutomaticDiscounts {
    automaticDiscountNodes(first: 50) {
      edges {
                node {
                  id
                  automaticDiscount {
                    ... on DiscountAutomaticBasic {
                      title
                      status
                      minimumRequirement {
                                        ... on DiscountMinimumSubtotal {
                                          greaterThanOrEqualToSubtotal { amount }
}
                ... on DiscountMinimumQuantity {
                                          greaterThanOrEqualToQuantity
}
      }
              customerGets {
                                value {
                                  ... on DiscountPercentage { percentage }
                  ... on DiscountAmount { amount { amount } }
    }
  }
  }
       }
}
}
}
}
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  const markets = await db.market.findMany({
        where: { shop: session.shop },
        include: { milestones: { where: { rewardType: { not: "no_discount" } } } },
});

  const allMilestonesWithDiscount = markets.flatMap((market) =>
    market.milestones.map((m) => ({ ...m, marketName: market.name, currency: market.currency }))
  );

  let shopifyDiscounts: any[] = [];
  try {
    const response = await admin.graphql(DISCOUNTS_QUERY);
    const data = await response.json();
    shopifyDiscounts = data?.data?.automaticDiscountNodes?.edges?.map((e: any) => e.node) || [];
} catch (e) {
    console.error("Failed to fetch discounts:", e);
}

  const results = allMilestonesWithDiscount.map((milestone) => {
    const matched = shopifyDiscounts.find((d: any) => {
      const discount = d.automaticDiscount;
      if (!discount || discount.status !== "ACTIVE") return false;
      const sub = discount.minimumRequirement?.greaterThanOrEqualToSubtotal?.amount;
      if (sub && Math.abs(parseFloat(sub) - milestone.threshold) < 1) {
        if (milestone.rewardType === "pct_off") {
          const pct = discount.customerGets?.value?.percentage;
          return pct && Math.abs(pct * 100 - (milestone.discountPct || 0)) < 1;
}
        if (milestone.rewardType === "flat_off") {
          const amt = discount.customerGets?.value?.amount?.amount;
          return amt && Math.abs(parseFloat(amt) - (milestone.fixedDiscount || 0)) < 1;
}
}
      return false;
});

    return {
      milestone,
      matched: !!matched,
      shopifyDiscount: matched || null,
};
});

  return json({ results, totalMilestones: allMilestonesWithDiscount.length });
}

export default function HealthPage() {
  const { results, totalMilestones } = useLoaderData<typeof loader>();

  const passing = results.filter((r: any) => r.matched).length;
  const failing = results.filter((r: any) => !r.matched).length;

  return (
    <Page
      title="Health Check"
      subtitle="Verify your Shopify discounts match your milestone configuration"
    >
      <BlockStack gap="500">
{totalMilestones === 0 ? (
          <Banner tone="info">
            No milestones with discounts configured yet.{" "}
            <Button variant="plain" url="/app/markets">Configure markets</Button> to get started.
          </Banner>
        ) : (
          <>
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p">{passing}</Text>
                  <Text as="p" tone="success">Matched ✓</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text variant="headingLg" as="p">{failing}</Text>
                  <Text as="p" tone="critical">Missing ✗</Text>
                </BlockStack>
              </Card>
            </InlineStack>

{failing > 0 && (
              <Banner tone="warning">
{failing} milestone{failing > 1 ? "s are" : " is"} missing matching Shopify discounts.
                Customers will see price reductions in the cart but checkout won&apos;t apply them.
                  </Banner>
                )}

            <BlockStack gap="300">
    {results.map((r: any, i: number) => (
                    <Card key={i}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={r.matched ? "success" : "critical"}>
    {r.matched ? "✓ Matched" : "✗ Missing"}
                        </Badge>
                            <Text variant="headingSm" as="h3">{r.milestone.rewardLabel}</Text>
                            <Text as="span" tone="subdued">{r.milestone.marketName}</Text>
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            Threshold: {r.milestone.currency} {r.milestone.threshold} ·{" "}
{r.milestone.rewardType === "pct_off"
                            ? `${r.milestone.discountPct}% off`
                            : `${r.milestone.currency} ${r.milestone.fixedDiscount} flat off`}
                      </Text>
                    </BlockStack>
{!r.matched && (
                      <Button
                        url="https://admin.shopify.com/discounts/new"
                        target="_blank"
                          tone="critical"
                          variant="plain"
                        >
                          Fix: Create Discount
                      </Button>
                    )}
                  </InlineStack>
                </Card>
              ))}
            </BlockStack>
          </>
        )}

        <Divider />

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">How to Create Matching Discounts</Text>
            <List type="number">
              <List.Item>Go to <strong>Shopify Admin → Discounts → Create discount → Automatic discount</strong></List.Item>
              <List.Item>Set <strong>Discount type</strong> to &quot;Amount off order&quot; or &quot;Percentage off&quot;</List.Item>
                <List.Item>Set <strong>Minimum purchase amount</strong> to match your milestone threshold exactly</List.Item>
                <List.Item>Set the discount value to match your milestone reward (% or flat amount)</List.Item>
              </List>
              <Button url="https://admin.shopify.com/discounts/new" target="_blank">
                Open Shopify Discounts
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
