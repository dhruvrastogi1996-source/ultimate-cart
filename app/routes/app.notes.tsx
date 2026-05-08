import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
    Page, Card, BlockStack, Button, Text, InlineStack,
    TextField, Banner, EmptyState, ButtonGroup, Checkbox, Divider
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const rules = await db.cartNoteRule.findMany({
          where: { shop: session.shop },
          orderBy: { sortOrder: "asc" },
    });
    return json({ rules });
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

  if (intent === "create") {
        const count = await db.cartNoteRule.count({ where: { shop: session.shop } });
        await db.cartNoteRule.create({
                data: {
                          shop: session.shop,
                          prompt: "Please share your details",
                          placeholder: "",
                          sortOrder: count,
                },
        });
  }

  if (intent === "save") {
        const id = String(formData.get("id"));
        await db.cartNoteRule.update({
                where: { id },
                data: {
                          trigger: String(formData.get("trigger")),
                          selectedVariants: String(formData.get("selectedVariants") || "[]"),
                          selectedProducts: String(formData.get("selectedProducts") || "[]"),
                          prompt: String(formData.get("prompt")),
                          placeholder: String(formData.get("placeholder")),
                          required: formData.get("required") === "true",
                          enabled: formData.get("enabled") === "true",
                },
        });
  }

  if (intent === "delete") {
        await db.cartNoteRule.delete({ where: { id: String(formData.get("id")) } });
  }

  return json({ ok: true });
}

function NoteRuleCard({ rule }: { rule: any }) {
    const [data, setData] = useState({ ...rule });
    const submit = useSubmit();

  const handleSave = () => {
        submit({
                intent: "save",
                id: data.id,
                trigger: data.trigger,
                selectedVariants: data.selectedVariants,
                selectedProducts: data.selectedProducts,
                prompt: data.prompt,
                placeholder: data.placeholder,
                required: String(data.required),
                enabled: String(data.enabled),
        }, { method: "post" });
  };

  return (
        <Card>
              <BlockStack gap="300">
                      <InlineStack align="space-between">
                                <Text variant="headingSm" as="h3">Cart Note Rule</Text>Text>
                                <InlineStack gap="200">
                                            <Button size="slim" tone="critical" variant="plain"
                                                            onClick={() => submit({ intent: "delete", id: data.id }, { method: "post" })}>
                                                          Delete
                                            </Button>Button>
                                </InlineStack>InlineStack>
                      </InlineStack>InlineStack>
              
                      <BlockStack gap="100">
                                <Text as="p" variant="bodySm">Trigger</Text>Text>
                                <ButtonGroup variant="segmented">
                                  {["always", "variant", "product"].map((t) => (
                        <Button key={t} pressed={data.trigger === t} onClick={() => setData({ ...data, trigger: t })}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Button>Button>
                      ))}
                                </ButtonGroup>ButtonGroup>
                      </BlockStack>BlockStack>
              
                {data.trigger === "variant" && (
                    <TextField
                                  label="Variant IDs (comma-separated)"
                                  value={Array.isArray(JSON.parse(data.selectedVariants || "[]"))
                                                  ? JSON.parse(data.selectedVariants).join(", ") : ""}
                                  onChange={(v) => setData({ ...data, selectedVariants: JSON.stringify(v.split(",").map((s: string) => s.trim()).filter(Boolean)) })}
                                  autoComplete="off"
                                  helpText="Enter Shopify variant IDs separated by commas"
                                />
                  )}
              
                {data.trigger === "product" && (
                    <TextField
                                  label="Product IDs (comma-separated)"
                                  value={Array.isArray(JSON.parse(data.selectedProducts || "[]"))
                                                  ? JSON.parse(data.selectedProducts).join(", ") : ""}
                                  onChange={(v) => setData({ ...data, selectedProducts: JSON.stringify(v.split(",").map((s: string) => s.trim()).filter(Boolean)) })}
                                  autoComplete="off"
                                  helpText="Enter Shopify product IDs separated by commas"
                                />
                  )}
              
                      <TextField
                                  label="Prompt Text"
                                  value={data.prompt}
                                  onChange={(v) => setData({ ...data, prompt: v })}
                                  autoComplete="off"
                                  placeholder="e.g. Please share your measurements"
                                />
              
                      <TextField
                                  label="Placeholder Text"
                                  value={data.placeholder}
                                  onChange={(v) => setData({ ...data, placeholder: v })}
                                  autoComplete="off"
                                  placeholder='e.g. Bust: __" Waist: __" Hips: __"'
                                />
              
                      <InlineStack gap="400">
                                <Checkbox
                                              label="Required to checkout"
                                              checked={data.required}
                                              onChange={(v) => setData({ ...data, required: v })}
                                            />
                                <Checkbox
                                              label="Enabled"
                                              checked={data.enabled}
                                              onChange={(v) => setData({ ...data, enabled: v })}
                                            />
                      </InlineStack>InlineStack>
              
                      <Button variant="primary" onClick={handleSave}>Save Rule</Button>Button>
              </BlockStack>BlockStack>
        </Card>Card>
      );
}

export default function NotesPage() {
    const { rules } = useLoaderData<typeof loader>();
    const submit = useSubmit();
  
    return (
          <Page
                  title="Cart Notes"
                  subtitle="Collect custom information from customers during checkout"
                  primaryAction={{
                            content: "+ Add Note Rule",
                            onAction: () => submit({ intent: "create" }, { method: "post" }),
                  }}
                >
                <BlockStack gap="400">
                  {rules.length === 0 ? (
                            <Card>
                                        <EmptyState
                                                        heading="No cart note rules"
                                                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                                        action={{ content: "Add your first rule", onAction: () => submit({ intent: "create" }, { method: "post" }) }}
                                                      >
                                                      <p>Create rules to collect measurements, gift messages, or any custom info from customers.</p>p>
                                        </EmptyState>EmptyState>
                            </Card>Card>
                          ) : (
                            rules.map((rule: any) => <NoteRuleCard key={rule.id} rule={rule} />)
                          )}
                </BlockStack>BlockStack>
          </Page>Page>
        );
}</Card>
