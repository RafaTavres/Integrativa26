import { SEGMENTS } from "./segments";
import type {
  Business,
  DemoState,
  Product,
  SegmentId,
  Transaction,
} from "./types";

function at(dayOffset: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function createBusiness(segmentId: SegmentId): Business {
  const segment = SEGMENTS[segmentId];
  return {
    id: `business-${segment.id}`,
    name: segment.businessName,
    ownerName: segment.ownerName,
    city: segment.city,
    segment: segment.id,
  };
}

export function createSeedState(segmentId: SegmentId): DemoState {
  const segment = SEGMENTS[segmentId];
  const productIds = new Map(
    segment.products.map((product) => [
      product.key,
      `${segment.id}-${product.key}`,
    ]),
  );

  const products: Product[] = segment.products.map((product) => ({
    id: productIds.get(product.key) as string,
    name: product.name,
    unit: product.unit,
    unitPlural: product.unitPlural,
    stock: product.stock,
    minStock: product.minStock,
    costCents: product.costCents,
    priceCents: product.priceCents,
    trackStock: product.trackStock,
    createdAt: at(90, 8, 0),
  }));

  const transactions: Transaction[] = segment.transactions.map(
    (transaction) => {
      const occurredAt = at(
        transaction.dayOffset,
        transaction.hour,
        transaction.minute,
      );
      return {
        id: `${segment.id}-tx-${transaction.key}`,
        kind: transaction.kind,
        description: transaction.description,
        amountCents: transaction.amountCents,
        quantity: transaction.quantity,
        productId: transaction.productKey
          ? productIds.get(transaction.productKey)
          : undefined,
        paymentMethod: transaction.paymentMethod,
        sourceType: "manual",
        status: "processed",
        occurredAt,
        createdAt: occurredAt,
      };
    },
  );

  const pendingProductId = productIds.get(segment.pending.productKey);
  const pendingProduct = products.find(
    (product) => product.id === pendingProductId,
  );
  const pendingAt = at(0, 12, 47);

  if (pendingProduct) {
    transactions.unshift({
      id: `${segment.id}-pending`,
      kind: "sale",
      description: pendingProduct.name,
      productId: pendingProduct.id,
      quantity: segment.pending.quantity,
      amountCents: segment.pending.amountCents,
      sourceType: "audio_transcription",
      status: "pending_review",
      aiConfidence: segment.pending.aiConfidence,
      rawInput: segment.pending.rawInput,
      occurredAt: pendingAt,
      createdAt: pendingAt,
    });
  }

  return {
    version: 2,
    segmentId,
    products,
    transactions,
    inventoryLogs: [],
  };
}
