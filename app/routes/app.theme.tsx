import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page, Card, BlockStack, Button, Text, InlineStack,
  Select, ColorPicker, TextField, Banner, Divider, hsbToHex, hexToHsb
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const settings = await db.themeSettings.findUnique({ where: { shop: session.shop } });
  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    bgColor: String(formData.get("bgColor") || "#FFFFFF"),
    textColor: String(formData.get("textColor") || "#1A1A1A"),
    accentColor: String(formData.get("accentColor") || "#8B0000"),
    headingFont: String(formData.get("headingFont") || "Cormorant Garamond"),
    bodyFont: String(formData.get("bodyFont") || "Inter"),
    buttonStyle: String(formData.get("buttonStyle") || "square"),
    borderRadius: String(formData.get("borderRadius") || "none"),
  };

  await db.themeSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, ...data },
    update: data,
  });

  return json({ ok: true });
}

const BUTTON_STYLES = [
  { label: "Square", value: "square" },
  { label: "Rounded", value: "rounded" },
  { label: "Pill", value: "pill" },
];

const BORDER_RADIUS_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Small (4px)", value: "4px" },
  { label: "Medium (8px)", value: "8px" },
  { label: "Large (16px)", value: "16px" },
];

const FONT_OPTIONS = [
  { label: "Inter", value: "Inter" },
  { label: "Cormorant Garamond", value: "Cormorant Garamond" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "Lato", value: "Lato" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Roboto", value: "Roboto" },
];

export default function ThemePage() {
  const { settings } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [bgColor, setBgColor] = useState(settings?.bgColor || "#FFFFFF");
  const [textColor, setTextColor] = useState(settings?.textColor || "#1A1A1A");
  const [accentColor, setAccentColor] = useState(settings?.accentColor || "#8B0000");
  const [headingFont, setHeadingFont] = useState(settings?.headingFont || "Cormorant Garamond");
  const [bodyFont, setBodyFont] = useState(settings?.bodyFont || "Inter");
  const [buttonStyle, setButtonStyle] = useState(settings?.buttonStyle || "square");
  const [borderRadius, setBorderRadius] = useState(settings?.borderRadius || "none");

  const handleSave = useCallback(() => {
    submit(
      { bgColor, textColor, accentColor, headingFont, bodyFont, buttonStyle, borderRadius },
      { method: "post" }
    );
  }, [bgColor, textColor, accentColor, headingFont, bodyFont, buttonStyle, borderRadius, submit]);

  return (
    <Page
      title="Theme Settings"
      subtitle="Customize the appearance of the cart drawer"
      primaryAction={{ content: "Save", onAction: handleSave, loading: isSaving }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Colors</Text>
            <InlineStack gap="400" wrap>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">Background Color</Text>
                <TextField label="Background Color" value={bgColor} onChange={setBgColor} prefix="#" autoComplete="off" />
                <div style={{ width: 40, height: 40, background: bgColor, border: "1px solid #ccc", borderRadius: 4 }} />
              </BlockStack>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">Text Color</Text>
                <TextField label="Text Color" value={textColor} onChange={setTextColor} prefix="#" autoComplete="off" />
                <div style={{ width: 40, height: 40, background: textColor, border: "1px solid #ccc", borderRadius: 4 }} />
              </BlockStack>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">Accent Color</Text>
                <TextField label="Accent Color" value={accentColor} onChange={setAccentColor} prefix="#" autoComplete="off" />
                <div style={{ width: 40, height: 40, background: accentColor, border: "1px solid #ccc", borderRadius: 4 }} />
              </BlockStack>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Typography</Text>
            <Select label="Heading Font" options={FONT_OPTIONS} value={headingFont} onChange={setHeadingFont} />
            <Select label="Body Font" options={FONT_OPTIONS} value={bodyFont} onChange={setBodyFont} />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Buttons & Borders</Text>
            <Select label="Button Style" options={BUTTON_STYLES} value={buttonStyle} onChange={setButtonStyle} />
            <Select label="Border Radius" options={BORDER_RADIUS_OPTIONS} value={borderRadius} onChange={setBorderRadius} />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Preview</Text>
            <Banner tone="info">
              Theme changes will be reflected in the cart drawer on your storefront after saving.
            </Banner>
            <div
              style={{
                background: bgColor,
                color: textColor,
                padding: 24,
                borderRadius: borderRadius === "none" ? 0 : borderRadius,
                border: "1px solid " + accentColor,
                fontFamily: bodyFont,
                maxWidth: 360,
              }}
            >
              <p style={{ fontFamily: headingFont, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Your Cart (2 items)
              </p>
              <p style={{ fontSize: 14, marginBottom: 16 }}>Sample product — Rs.1,299</p>
              <button
                style={{
                  background: accentColor,
                  color: bgColor,
                  border: "none",
                  padding: buttonStyle === "pill" ? "10px 24px" : "10px 20px",
                  borderRadius: buttonStyle === "pill" ? 999 : buttonStyle === "rounded" ? 8 : 0,
                  cursor: "pointer",
                  fontFamily: bodyFont,
                  fontWeight: 600,
                }}
              >
                Checkout
              </button>
            </div>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
