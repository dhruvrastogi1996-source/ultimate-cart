/**
 * Ultimate Cart - Milestone Discount Shopify Function
 * 
 * This function reads milestone configuration from shop metafields
 * and applies percentage discounts when cart value thresholds are met.
 * 
 * Milestone config format (stored in shop metafield ultimate_cart.milestones):
 * [
 *   { "threshold": 50, "discountPct": 5, "triggerType": "cart_value", "currency": "USD" },
 *   { "threshold": 100, "discountPct": 10, "triggerType": "cart_value", "currency": "USD" },
 *   { "threshold": 5, "discountPct": 15, "triggerType": "item_count", "currency": "USD" }
 * ]
 */

// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @type {FunctionRunResult}
 */
const EMPTY_DISCOUNT = {
  discounts: [],
  discountApplicationStrategy: "FIRST",
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  // Get cart subtotal in cents
  const subtotalAmount = parseFloat(
    input.cart.cost.subtotalAmount.amount
  );

  // Get total item count across all cart lines
  const totalItemCount = input.cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0
  );

  // Read milestone configuration from shop metafield
  const milestonesMetafield = input.shop?.metafield?.value;
  
  if (!milestonesMetafield) {
    // No milestones configured - return no discount
    return EMPTY_DISCOUNT;
  }

  let milestones;
  try {
    milestones = JSON.parse(milestonesMetafield);
  } catch (e) {
    return EMPTY_DISCOUNT;
  }

  if (!Array.isArray(milestones) || milestones.length === 0) {
    return EMPTY_DISCOUNT;
  }

  // Sort milestones by threshold descending to find the highest applicable one
  const sortedMilestones = [...milestones].sort((a, b) => b.threshold - a.threshold);

  // Find the highest milestone that the cart has reached
  let applicableMilestone = null;

  for (const milestone of sortedMilestones) {
    const threshold = parseFloat(milestone.threshold || 0);
    const triggerType = milestone.triggerType || "cart_value";
    const discountPct = parseFloat(milestone.discountPct || 0);

    if (discountPct <= 0) continue;

    if (triggerType === "item_count") {
      if (totalItemCount >= threshold) {
        applicableMilestone = milestone;
        break;
      }
    } else {
      // Default: cart_value comparison
      if (subtotalAmount >= threshold) {
        applicableMilestone = milestone;
        break;
      }
    }
  }

  if (!applicableMilestone) {
    return EMPTY_DISCOUNT;
  }

  const discountPct = parseFloat(applicableMilestone.discountPct);

  // Return a percentage discount on the whole order
  return {
    discounts: [
      {
        value: {
          percentage: {
            value: discountPct.toString(),
          },
        },
        targets: [
          {
            orderSubtotal: {
              excludedVariantIds: [],
            },
          },
        ],
        message: `${discountPct}% off - Milestone reached!`,
      },
    ],
    discountApplicationStrategy: "FIRST",
  };
}
