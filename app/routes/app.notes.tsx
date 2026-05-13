import { useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Button, BlockStack, InlineStack,
  Text, Select, TextField, Badge, Banner, Divider,
  ResourceList, ResourceItem, Thumbnail, Icon, EmptyState,
  Spinner, Tag, Combobox, Listbox, AutoSelection,
} from "@shopify/polaris";
import { SearchIcon, DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CartNoteRule {
  id: string;
  trigger: string;
  selectedVariants: string;
  selectedProducts: string;
  prompt: string;
  placeholder: string;
  required: boolean;
  enabled: boolean;
  sortOrder: number;
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  featuredImage: { url: string } | null;
  variants: { edges: { node: { id: string; title: string; sku: string } }[] };
}

interface LoaderData {
  rules: CartNoteRule[];
  products: ShopifyProduct[];
  allVariantOptions: { label: string; value: string }[];
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch all products with variants from Shopify
  const productsQuery = `
    query GetAllProducts($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title handle
            featuredImage { url }
            variants(first: 100) {
              edges {
                node { id title sku }
              }
            }
          }
        }
      }
    }
  `;

  let allProducts: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response: any = await admin.graphql(productsQuery, {
      variables: { cursor },
    });
    const data: any = await response.json();
    const productsData: any = data.data?.products;
    if (!productsData) break;

    allProducts = allProducts.concat(
      productsData.edges.map((e: any) => e.node)
    );
    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;
  }

  // Build unique variant options (deduplicated by title/name)
  const variantTitleSet = new Set<string>();
  const allVariantOptions: { label: string; value: string }[] = [];
  for (const product of allProducts) {
    for (const edge of product.variants.edges) {
      const v = edge.node;
      // Use variant title as the unique key (e.g. "Small", "Red / L")
      if (!variantTitleSet.has(v.title)) {
        variantTitleSet.add(v.title);
        allVariantOptions.push({ label: v.title, value: v.title });
      }
    }
  }
  allVariantOptions.sort((a, b) => a.label.localeCompare(b.label));

  // Load rules from DB
  const rules = await db.cartNoteRule.findMany({
    where: { shop: session.shop },
    orderBy: { sortOrder: "asc" },
  });

  return json<LoaderData>({
    rules: rules.map((r) => ({
      ...r,
      id: r.id.toString(),
      sortOrder: r.sortOrder ?? 0,
    })),
    products: allProducts,
    allVariantOptions,
  });
};

// ─── Action ───────────────────────────────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    await db.cartNoteRule.create({
      data: {
        shop: session.shop,
        trigger: "always",
        selectedVariants: "",
        selectedProducts: "",
        prompt: "Any special instructions?",
        placeholder: "Please share any notes...",
        required: false,
        enabled: true,
        sortOrder: Date.now(),
      },
    });
  }

  if (intent === "save") {
    await db.cartNoteRule.update({
      where: { id: form.get("id") as string },
      data: {
        trigger: form.get("trigger") as string,
        selectedVariants: form.get("selectedVariants") as string,
        selectedProducts: form.get("selectedProducts") as string,
        prompt: form.get("prompt") as string,
        placeholder: form.get("placeholder") as string,
        required: form.get("required") === "true",
        enabled: form.get("enabled") === "true",
      },
    });
  }

  if (intent === "delete") {
    await db.cartNoteRule.delete({
      where: { id: form.get("id") as string },
    });
  }

  return redirect("/app/notes");
};

// ─── Multi-select variant combobox ────────────────────────────────────────────
function VariantMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { label: string; value: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(inputVal.toLowerCase())
  );

  const handleSelect = useCallback(
    (val: string) => {
      if (selected.includes(val)) {
        onChange(selected.filter((s) => s !== val));
      } else {
        onChange([...selected, val]);
      }
      setInputVal("");
    },
    [selected, onChange]
  );

  return (
    <BlockStack gap="200">
      <Combobox
        allowMultiple
        activator={
          <Combobox.TextField
            prefix={<Icon source={SearchIcon} />}
            onChange={setInputVal}
            label="Search variant options"
            labelHidden
            value={inputVal}
            placeholder="Search variant options (e.g. Small, Red / L)"
            autoComplete="off"
          />
        }
      >
        {filtered.length > 0 ? (
          <Listbox autoSelection={AutoSelection.None} onSelect={handleSelect}>
            {filtered.map((o) => (
              <Listbox.Option
                key={o.value}
                value={o.value}
                selected={selected.includes(o.value)}
                accessibilityLabel={o.label}
              >
                {o.label}
              </Listbox.Option>
            ))}
          </Listbox>
        ) : (
          <Listbox>
            <Listbox.Action value="">No variants match</Listbox.Action>
          </Listbox>
        )}
      </Combobox>
      {selected.length > 0 && (
        <InlineStack gap="100" wrap>
          {selected.map((val) => (
            <Tag key={val} onRemove={() => onChange(selected.filter((s) => s !== val))}>
              {val}
            </Tag>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

// ─── Multi-select product combobox ────────────────────────────────────────────
function ProductMultiSelect({
  products,
  selected,
  onChange,
}: {
  products: ShopifyProduct[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const filtered = products.filter((p) =>
    p.title.toLowerCase().includes(inputVal.toLowerCase())
  );

  const handleSelect = useCallback(
    (val: string) => {
      if (selected.includes(val)) {
        onChange(selected.filter((s) => s !== val));
      } else {
        onChange([...selected, val]);
      }
      setInputVal("");
    },
    [selected, onChange]
  );

  const selectedProducts = products.filter((p) => selected.includes(p.id));

  return (
    <BlockStack gap="200">
      <Combobox
        allowMultiple
        activator={
          <Combobox.TextField
            prefix={<Icon source={SearchIcon} />}
            onChange={setInputVal}
            label="Search products"
            labelHidden
            value={inputVal}
            placeholder="Search and select products..."
            autoComplete="off"
          />
        }
      >
        {filtered.length > 0 ? (
          <Listbox autoSelection={AutoSelection.None} onSelect={handleSelect}>
            {filtered.map((p) => (
              <Listbox.Option
                key={p.id}
                value={p.id}
                selected={selected.includes(p.id)}
                accessibilityLabel={p.title}
              >
                <InlineStack gap="200" blockAlign="center">
                  {p.featuredImage ? (
                    <Thumbnail source={p.featuredImage.url} alt={p.title} size="extraSmall" />
                  ) : (
                    <div style={{ width: 20, height: 20, background: "#e3e3e3", borderRadius: 4 }} />
                  )}
                  <Text as="span">{p.title}</Text>
                </InlineStack>
              </Listbox.Option>
            ))}
          </Listbox>
        ) : (
          <Listbox>
            <Listbox.Action value="">No products match</Listbox.Action>
          </Listbox>
        )}
      </Combobox>
      {selectedProducts.length > 0 && (
        <InlineStack gap="100" wrap>
          {selectedProducts.map((p) => (
            <Tag key={p.id} onRemove={() => onChange(selected.filter((s) => s !== p.id))}>
              {p.title}
            </Tag>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────
function RuleCard({
  rule,
  products,
  allVariantOptions,
}: {
  rule: CartNoteRule;
  products: ShopifyProduct[];
  allVariantOptions: { label: string; value: string }[];
}) {
  const submit = useSubmit();
  const nav = useNavigation();
  const isSaving = nav.state !== "idle" && nav.formData?.get("id") === rule.id;

  const [trigger, setTrigger] = useState(rule.trigger);
  const [prompt, setPrompt] = useState(rule.prompt);
  const [placeholder, setPlaceholder] = useState(rule.placeholder);
  const [required, setRequired] = useState(rule.required);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [selectedVariants, setSelectedVariants] = useState<string[]>(
    rule.selectedVariants ? rule.selectedVariants.split(",").filter(Boolean) : []
  );
  const [selectedProducts, setSelectedProducts] = useState<string[]>(
    rule.selectedProducts ? rule.selectedProducts.split(",").filter(Boolean) : []
  );

  const handleSave = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("id", rule.id);
    fd.set("trigger", trigger);
    fd.set("selectedVariants", selectedVariants.join(","));
    fd.set("selectedProducts", selectedProducts.join(","));
    fd.set("prompt", prompt);
    fd.set("placeholder", placeholder);
    fd.set("required", String(required));
    fd.set("enabled", String(enabled));
    submit(fd, { method: "post" });
  };

  const handleDelete = () => {
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", rule.id);
    submit(fd, { method: "post" });
  };

  const triggerOptions = [
    { label: "Always (every cart)", value: "always" },
    { label: "Specific Products in cart", value: "product" },
    { label: "Specific Variant options in cart", value: "variant" },
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h3" variant="headingMd">
              Cart Note Rule
            </Text>
            <Badge tone={enabled ? "success" : "critical"}>
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          </InlineStack>
          <InlineStack gap="200">
            <Button
              variant="plain"
              tone="critical"
              icon={DeleteIcon}
              onClick={handleDelete}
              accessibilityLabel="Delete rule"
            />
          </InlineStack>
        </InlineStack>

        <Divider />

        <Select
          label="Show note field when..."
          options={triggerOptions}
          value={trigger}
          onChange={setTrigger}
        />

        {trigger === "variant" && (
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="medium">
              Variant options to trigger on
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Shows the note field when any cart item has one of these variant options (e.g. "Size: 6", "Color: Red")
            </Text>
            <VariantMultiSelect
              options={allVariantOptions}
              selected={selectedVariants}
              onChange={setSelectedVariants}
            />
          </BlockStack>
        )}

        {trigger === "product" && (
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="medium">
              Products to trigger on
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Shows the note field when any of these products are in the cart
            </Text>
            <ProductMultiSelect
              products={products}
              selected={selectedProducts}
              onChange={setSelectedProducts}
            />
          </BlockStack>
        )}

        <TextField
          label="Prompt / heading text"
          value={prompt}
          onChange={setPrompt}
          autoComplete="off"
          helpText="Shown above the text area (e.g. \'Any special instructions?\')"
        />

        <TextField
          label="Placeholder text"
          value={placeholder}
          onChange={setPlaceholder}
          autoComplete="off"
          placeholder="Bust: __ Waist: __ Hips: __"
          helpText="Placeholder shown inside the empty textarea"
        />

        <InlineStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <input
              type="checkbox"
              id={`req-${rule.id}`}
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            <label htmlFor={`req-${rule.id}`}>
              <Text as="span" variant="bodySm">Required (blocks checkout if empty)</Text>
            </label>
          </InlineStack>
          <InlineStack gap="200" blockAlign="center">
            <input
              type="checkbox"
              id={`en-${rule.id}`}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor={`en-${rule.id}`}>
              <Text as="span" variant="bodySm">Enabled</Text>
            </label>
          </InlineStack>
        </InlineStack>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSave} loading={isSaving}>
            Save Rule
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotesPage() {
  const { rules, products, allVariantOptions } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleAdd = () => {
    const fd = new FormData();
    fd.set("intent", "create");
    submit(fd, { method: "post" });
  };

  return (
    <Page
      title="Cart Notes"
      primaryAction={{ content: "Add Rule", onAction: handleAdd, icon: PlusIcon }}
    >
      <Layout>
        <Layout.Section>
          <Banner tone="info">
            <Text as="p">
              Cart note rules let you collect custom input from customers.
              "Always" trigger shows for every cart. "Variant" and "Product" triggers only show when those items are in the cart.
              Note text saves to Shopify&apos;s cart note attribute, which appears on the order.
            </Text>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          {rules.length === 0 ? (
            <Card>
              <EmptyState
                heading="No note rules yet"
                action={{ content: "Add First Rule", onAction: handleAdd }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Add note rules to prompt customers for measurements, personalization details, or custom messages.</p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="400">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  products={products}
                  allVariantOptions={allVariantOptions}
                />
              ))}
              <InlineStack align="center">
                <Button onClick={handleAdd} icon={PlusIcon}>
                  Add Another Rule
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
