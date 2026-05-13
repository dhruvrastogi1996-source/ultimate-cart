import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge,
  TextField, Select, Banner, Divider, ButtonGroup, Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const HEADING_FONTS = [
  "Cormorant Garamond", "Playfair Display", "Georgia", "Libre Caslon Text",
  "DM Serif Display", "Lora", "Crimson Text", "EB Garamond",
];
const BODY_FONTS = [
  "Inter", "Helvetica", "Work Sans", "DM Sans", "Manrope",
  "IBM Plex Sans", "Karla", "Space Grotesk",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await db.themeSettings.findUnique({ where: { shop: session.shop } });
  return json({
    settings: settings || {
      bgColor: "#FFFFFF", textColor: "#1A1A1A", accentColor: "#B8860B",
      headingFont: "Cormorant Garamond", bodyFont: "Inter",
      buttonStyle: "rounded", borderRadius: "soft",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await db.themeSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      bgColor: form.get("bgColor") as string,
      textColor: form.get("textColor") as string,
      accentColor: form.get("accentColor") as string,
      headingFont: form.get("headingFont") as string,
      bodyFont: form.get("bodyFont") as string,
      buttonStyle: form.get("buttonStyle") as string,
      borderRadius: form.get("borderRadius") as string,
    },
    update: {
      bgColor: form.get("bgColor") as string,
      textColor: form.get("textColor") as string,
      accentColor: form.get("accentColor") as string,
      headingFont: form.get("headingFont") as string,
      bodyFont: form.get("bodyFont") as string,
      buttonStyle: form.get("buttonStyle") as string,
      borderRadius: form.get("borderRadius") as string,
    },
  });
  return json({ ok: true });
};

export default function ThemePage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();

  const [bgColor, setBgColor] = useState(settings.bgColor);
  const [textColor, setTextColor] = useState(settings.textColor);
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [headingFont, setHeadingFont] = useState(settings.headingFont);
  const [bodyFont, setBodyFont] = useState(settings.bodyFont);
  const [buttonStyle, setButtonStyle] = useState(settings.buttonStyle);
  const [borderRadius, setBorderRadius] = useState(settings.borderRadius);

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("bgColor", bgColor);
    fd.append("textColor", textColor);
    fd.append("accentColor", accentColor);
    fd.append("headingFont", headingFont);
    fd.append("bodyFont", bodyFont);
    fd.append("buttonStyle", buttonStyle);
    fd.append("borderRadius", borderRadius);
    submit(fd, { method: "post" });
  }, [bgColor, textColor, accentColor, headingFont, bodyFont, buttonStyle, borderRadius, submit]);

  const handleReset = useCallback(() => {
    setBgColor("#FFFFFF"); setTextColor("#1A1A1A"); setAccentColor("#B8860B");
    setHeadingFont("Cormorant Garamond"); setBodyFont("Inter");
    setButtonStyle("rounded"); setBorderRadius("soft");
  }, []);

  const btnRadius = buttonStyle === "pill" ? "9999px" : buttonStyle === "rounded" ? "8px" : "0px";
  const cardRadius = borderRadius === "rounded" ? "16px" : borderRadius === "soft" ? "8px" : "0px";

  return (
    <Page
      title="Theme"
      subtitle="Customize the cart drawer to match your store"
      primaryAction={{ content: "Save Theme", onAction: handleSave, loading: nav.state === "submitting" }}
      secondaryActions={[{ content: "Reset to Defaults", onAction: handleReset }]}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section variant="oneHalf">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Colors</Text>
                <Banner tone="info">
                  <Text as="p" variant="bodySm">Auto-detected from your Shopify theme. Override anything below.</Text>
                </Banner>
                <InlineStack gap="400" wrap>
                  {[
                    { label: "Background Color", value: bgColor, onChange: setBgColor },
                    { label: "Text Color", value: textColor, onChange: setTextColor },
                    { label: "Accent Color", value: accentColor, onChange: setAccentColor },
                  ].map(({ label, value, onChange }) => (
                    <BlockStack gap="200" key={label}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                          style={{ width: "40px", height: "40px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                        />
                        <div style={{ width: "110px" }}>
                          <TextField label="" value={value} onChange={onChange} autoComplete="off" />
                        </div>
                      </InlineStack>
                    </BlockStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Typography</Text>
                <Select
                  label="Heading Font"
                  options={HEADING_FONTS.map((f) => ({ label: f, value: f }))}
                  value={headingFont}
                  onChange={setHeadingFont}
                />
                <Select
                  label="Body Font"
                  options={BODY_FONTS.map((f) => ({ label: f, value: f }))}
                  value={bodyFont}
                  onChange={setBodyFont}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Style</Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Button Style</Text>
                  <ButtonGroup variant="segmented">
                    <Button pressed={buttonStyle === "square"} onClick={() => setButtonStyle("square")}>Square</Button>
                    <Button pressed={buttonStyle === "rounded"} onClick={() => setButtonStyle("rounded")}>Rounded</Button>
                    <Button pressed={buttonStyle === "pill"} onClick={() => setButtonStyle("pill")}>Pill</Button>
                  </ButtonGroup>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Card Border Radius</Text>
                  <ButtonGroup variant="segmented">
                    <Button pressed={borderRadius === "none"} onClick={() => setBorderRadius("none")}>None</Button>
                    <Button pressed={borderRadius === "soft"} onClick={() => setBorderRadius("soft")}>Soft</Button>
                    <Button pressed={borderRadius === "rounded"} onClick={() => setBorderRadius("rounded")}>Rounded</Button>
                  </ButtonGroup>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Live Preview</Text>
              <Divider />
              <div style={{
                background: bgColor, color: textColor, borderRadius: cardRadius,
                padding: "24px", fontFamily: bodyFont, border: "1px solid #e1e3e5",
                maxWidth: "360px",
              }}>
                <div style={{ marginBottom: "16px" }}>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">BRAND NAME</Text>
                  <p style={{ fontFamily: headingFont, fontStyle: "italic", fontSize: "20px", textAlign: "center", margin: "4px 0" }}>
                    Your Cart · 3
                  </p>
                </div>
                <Divider />
                <div style={{ margin: "12px 0" }}>
                  <div style={{ background: "#f0f0f0", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
                    <div style={{ background: accentColor, width: "60%", height: "100%", borderRadius: "4px" }} />
                  </div>
                  <p style={{ fontSize: "12px", color: accentColor, margin: "6px 0 0", fontFamily: headingFont }}>
                    Add ₹400 more for Free Shipping 🚚
                  </p>
                </div>
                <Divider />
                <div style={{ margin: "16px 0", fontSize: "14px" }}>
                  <p style={{ fontFamily: headingFont, fontStyle: "italic", margin: "4px 0" }}>Slim Fit Kurta</p>
                  <p style={{ fontSize: "11px", letterSpacing: "0.08em", margin: "2px 0", opacity: 0.6 }}>SIZE M / INDIGO</p>
                  <p style={{ margin: "4px 0" }}>₹1,200</p>
                </div>
                <Divider />
                <div style={{ margin: "16px 0 8px", fontSize: "12px", letterSpacing: "0.1em", opacity: 0.5, textAlign: "center" }}>
                  MADE IN INDIA &nbsp;·&nbsp; EASY RETURNS &nbsp;·&nbsp; COD AVAILABLE
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 0", fontSize: "14px" }}>
                  <span>Subtotal</span><span>₹3,600</span>
                </div>
                <p style={{ fontFamily: headingFont, fontStyle: "italic", color: accentColor, fontSize: "13px", margin: "4px 0" }}>
                  You're saving ₹400!
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 0" }}>
                  <span style={{ fontFamily: headingFont, fontWeight: "bold", fontSize: "18px" }}>Total</span>
                  <span style={{ fontFamily: headingFont, fontWeight: "bold", fontSize: "18px" }}>₹3,200</span>
                </div>
                <button style={{
                  width: "100%", background: textColor, color: bgColor,
                  border: "none", borderRadius: btnRadius, padding: "14px",
                  fontSize: "12px", letterSpacing: "0.15em", cursor: "pointer",
                  fontFamily: bodyFont, marginTop: "12px",
                }}>
                  PROCEED TO CHECKOUT
                </button>
              </div>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Live preview updates as you change settings above
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
