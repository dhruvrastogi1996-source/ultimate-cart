import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge,
  TextField, EmptyState, Thumbnail, ResourceList, ResourceItem,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const PRODUCTS_QUERY = `#graphql
  query SearchProducts($query: String!) {
    products(first: 10, query: $query) {
      edges {
        node {
          id title handle
          featuredImage { url altText }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const upsells = await db.upsellProduct.findMany({
    where: { shop: session.shop },
    orderBy: { sortOrder: "asc" },
  });
  return json({ upsells });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "search") {
    const query = form.get("query") as string;
    const res = await admin.graphql(PRODUCTS_QUERY, { variables: { query } });
    const data = await res.json();
    return json({ products: data.data.products.edges.map((e: any) => e.node) });
  }

  if (intent === "add") {
    const count = await db.upsellProduct.count({ where: { shop: session.shop } });
    await db.upsellProduct.create({
      data: {
        shop: session.shop,
        productId: form.get("productId") as string,
        productTitle: form.get("productTitle") as string,
        productHandle: form.get("productHandle") as string,
        imageUrl: form.get("imageUrl") as string,
        sortOrder: count,
      },
    });
  }

  if (intent === "remove") {
    await db.upsellProduct.delete({ where: { id: form.get("id") as string } });
  }

  if (intent === "toggle") {
    const id = form.get("id") as string;
    const cur = await db.upsellProduct.findUnique({ where: { id } });
    if (cur) await db.upsellProduct.update({ where: { id }, data: { enabled: !cur.enabled } });
  }

  return json({ ok: true });
};

export default function UpsellsPage() {
  const { upsells } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = useCallback(async () => {
    const fd = new FormData();
    fd.append("intent", "search");
    fd.append("query", searchQuery);
    submit(fd, { method: "post" });
  }, [searchQuery, submit]);

  const handleAdd = useCallback((product: any) => {
    const fd = new FormData();
    fd.append("intent", "add");
    fd.append("productId", product.id);
    fd.append("productTitle", product.title);
    fd.append("productHandle", product.handle);
    fd.append("imageUrl", product.featuredImage?.url || "");
    submit(fd, { method: "post" });
  }, [submit]);

  return (
    <Page
      title="Upsell Products"
      subtitle="Show recommended products as a carousel in the cart drawer"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Search & Add Products</Text>
              <InlineStack gap="300" blockAlign="end">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Search products"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Type product name..."
                    autoComplete="off"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                  />
                </div>
                <Button onClick={handleSearch} loading={nav.state === "submitting"}>Search</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          {upsells.length === 0 ? (
            <Card>
              <EmptyState
                heading="No upsell products yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Search for products above and add them to the upsell carousel shown in the cart drawer.</p>
              </EmptyState>
            </Card>
          ) : (
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: "product", plural: "products" }}
                items={upsells}
                renderItem={(upsell) => (
                  <ResourceItem
                    id={upsell.id}
                    media={<Thumbnail source={upsell.imageUrl || ""} alt={upsell.productTitle} size="medium" />}
                    accessibilityLabel={`Upsell: ${upsell.productTitle}`}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="bold" as="h3">{upsell.productTitle}</Text>
                        <Badge tone={upsell.enabled ? "success" : "attention"}>{upsell.enabled ? "Active" : "Hidden"}</Badge>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button size="slim" variant="plain" onClick={() => {
                          const fd = new FormData();
                          fd.append("intent", "toggle");
                          fd.append("id", upsell.id);
                          submit(fd, { method: "post" });
                        }}>{upsell.enabled ? "Hide" : "Show"}</Button>
                        <Button size="slim" variant="plain" tone="critical" onClick={() => {
                          const fd = new FormData();
                          fd.append("intent", "remove");
                          fd.append("id", upsell.id);
                          submit(fd, { method: "post" });
                        }}>Remove</Button>
                      </InlineStack>
                    </InlineStack>
                  </ResourceItem>
                )}
              />
            </Card>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
