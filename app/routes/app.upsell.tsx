import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useNavigation } from "@remix-run/react";
import { Page, Card, BlockStack, Button, Text, InlineStack, Badge, Modal, TextField, Banner, EmptyState, Thumbnail } from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const products = await db.upsellProduct.findMany({
    where: { shop: session.shop },
    orderBy: { sortOrder: "asc" },
  });
  return json({ products });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "add") {
    const productId = String(formData.get("productId"));
    const productTitle = String(formData.get("productTitle"));
    const productHandle = String(formData.get("productHandle"));
    const imageUrl = String(formData.get("imageUrl") || "");
    const price = String(formData.get("price") || "");
    const count = await db.upsellProduct.count({ where: { shop: session.shop } });
    await db.upsellProduct.create({
      data: { shop: session.shop, productId, productTitle, productHandle, imageUrl, price, sortOrder: count },
    });
  }

  if (intent === "toggle") {
    const id = String(formData.get("id"));
    const enabled = formData.get("enabled") === "true";
    await db.upsellProduct.update({ where: { id }, data: { enabled: !enabled } });
  }

  if (intent === "delete") {
    const id = String(formData.get("id"));
    await db.upsellProduct.delete({ where: { id } });
  }

  return json({ ok: true });
}

export default function UpsellPage() {
  const { products } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [modalOpen, setModalOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [productHandle, setProductHandle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("");
  const isSaving = navigation.state === "submitting";

  const handleAdd = useCallback(() => {
    if (!productId || !productTitle) return;
    submit({ intent: "add", productId, productTitle, productHandle, imageUrl, price }, { method: "post" });
    setModalOpen(false);
    setProductId(""); setProductTitle(""); setProductHandle(""); setImageUrl(""); setPrice("");
  }, [productId, productTitle, productHandle, imageUrl, price, submit]);

  return (
    <Page
      title="Upsell Products"
      subtitle="Show recommended products inside the cart drawer"
      primaryAction={{ content: "Add Product", onAction: () => setModalOpen(true) }}
    >
      <BlockStack gap="400">
        {products.length === 0 ? (
          <Card>
            <EmptyState
              heading="No upsell products yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Add first product", onAction: () => setModalOpen(true) }}
            >
              <p>Add products to recommend inside the cart drawer and increase average order value.</p>
            </EmptyState>
          </Card>
        ) : (
          products.map((product) => (
            <Card key={product.id}>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <Thumbnail
                    source={product.imageUrl || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
                    alt={product.productTitle}
                    size="small"
                  />
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h3">{product.productTitle}</Text>
                    <Text as="span" tone="subdued">{product.price || "No price set"}</Text>
                  </BlockStack>
                  <Badge tone={product.enabled ? "success" : "critical"}>{product.enabled ? "Active" : "Disabled"}</Badge>
                </InlineStack>
                <InlineStack gap="200">
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="enabled" value={String(product.enabled)} />
                    <Button submit tone={product.enabled ? "critical" : undefined} variant="plain">{product.enabled ? "Disable" : "Enable"}</Button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={product.id} />
                    <Button submit tone="critical" variant="plain">Delete</Button>
                  </Form>
                </InlineStack>
              </InlineStack>
            </Card>
          ))
        )}
      </BlockStack>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Upsell Product"
        primaryAction={{ content: "Add Product", onAction: handleAdd, loading: isSaving }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Banner tone="info">Enter Shopify product details. Find the product ID in the Admin URL.</Banner>
            <TextField label="Product ID (Shopify GID)" value={productId} onChange={setProductId} placeholder="gid://shopify/Product/123456789" autoComplete="off" />
            <TextField label="Product Title" value={productTitle} onChange={setProductTitle} placeholder="e.g. Luxury Silk Scarf" autoComplete="off" />
            <TextField label="Product Handle" value={productHandle} onChange={setProductHandle} placeholder="e.g. luxury-silk-scarf" autoComplete="off" />
            <TextField label="Image URL" value={imageUrl} onChange={setImageUrl} placeholder="https://..." autoComplete="off" />
            <TextField label="Price (display only)" value={price} onChange={setPrice} placeholder="e.g. Rs.1299" autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
