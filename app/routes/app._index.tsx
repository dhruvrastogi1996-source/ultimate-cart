import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, InlineStack, Icon, Box, Divider, Banner } from "@shopify/polaris";
import { StoreIcon, ProductIcon, NoteIcon, ThemeIcon, CartIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const [marketCount, milestoneCount, noteCount, upsellCount] = await Promise.all([
    db.market.count(),
    db.milestone.count(),
    db.cartNoteRule.count(),
    db.upsellProduct.count(),
  ]);
  return json({ marketCount, milestoneCount, noteCount, upsellCount });
};

export default function Index() {
  const { marketCount, milestoneCount, noteCount, upsellCount } = useLoaderData();

  const stats = [
    { label: "Markets", value: marketCount, color: "#5C6AC4", link: "/app/markets", icon: StoreIcon },
    { label: "Milestones", value: milestoneCount, color: "#47C1BF", link: "/app/markets", icon: CartIcon },
    { label: "Cart Note Rules", value: noteCount, color: "#F49342", link: "/app/notes", icon: NoteIcon },
    { label: "Upsell Products", value: upsellCount, color: "#DE3618", link: "/app/upsells", icon: ProductIcon },
  ];

  const quickLinks = [
    { title: "Markets", description: "Configure cart settings per market or region", link: "/app/markets", icon: StoreIcon },
    { title: "Cart Notes", description: "Set up cart note prompts for customers", link: "/app/notes", icon: NoteIcon },
    { title: "Theme", description: "Customize colors, fonts and button styles", link: "/app/theme", icon: ThemeIcon },
    { title: "Upsells", description: "Add upsell products to the cart drawer", link: "/app/upsells", icon: ProductIcon },
    { title: "Health Check", description: "Verify discount codes are correctly configured", link: "/app/health", icon: CheckCircleIcon },
  ];

  return (
    <Page>
      <BlockStack gap="600">
        <BlockStack gap="200">
          <Text variant="headingXl" as="h1">Ultimate Cart</Text>
          <Text variant="bodyLg" tone="subdued">Conversion-optimized cart drawer for your Shopify store</Text>
        </BlockStack>

        <Layout>
          <Layout.Section>
            <InlineStack gap="400" wrap={true}>
              {stats.map((stat) => (
                <Box key={stat.label} minWidth="200px" flexGrow="1">
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="bodySm" tone="subdued">{stat.label}</Text>
                      <Text variant="heading2xl" as="p" fontWeight="bold">{stat.value}</Text>
                      <Button variant="plain" url={stat.link}>View all →</Button>
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>
          </Layout.Section>
        </Layout>

        <Divider />

        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Quick Navigation</Text>
          <Layout>
            <Layout.Section>
              <InlineStack gap="400" wrap={true}>
                {quickLinks.map((item) => (
                  <Box key={item.title} minWidth="200px" flexGrow="1">
                    <Card>
                      <BlockStack gap="300">
                        <Icon source={item.icon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingSm" as="h3">{item.title}</Text>
                          <Text variant="bodySm" tone="subdued">{item.description}</Text>
                        </BlockStack>
                        <Button url={item.link} variant="secondary">Open</Button>
                      </BlockStack>
                    </Card>
                  </Box>
                ))}
              </InlineStack>
            </Layout.Section>
          </Layout>
        </BlockStack>

        <Banner title="Getting Started" tone="info">
          <BlockStack gap="200">
            <Text variant="bodyMd">Set up your first market to configure your cart drawer. Each market can have its own milestones, trust badges, and currency settings.</Text>
            <Button url="/app/markets" variant="primary">Configure Markets</Button>
          </BlockStack>
        </Banner>
      </BlockStack>
    </Page>
  );
}
