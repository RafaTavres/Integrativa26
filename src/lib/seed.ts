import { SEGMENTS } from "./segments";
import type {
  Bill,
  Business,
  DemoState,
  Product,
  Purchase,
  SegmentId,
  Supplier,
  Transaction,
} from "./types";

function at(dayOffset: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/** Data pura (YYYY-MM-DD), sem fuso: é assim que contas a pagar são salvas. */
export function dateOnly(dayOffset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
  const supplierIds = new Map(
    segment.suppliers.map((supplier) => [
      supplier.key,
      `${segment.id}-supplier-${supplier.key}`,
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

  const suppliers: Supplier[] = segment.suppliers.map((supplier) => ({
    id: supplierIds.get(supplier.key) as string,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    notes: supplier.notes,
    createdAt: at(120, 9, 0),
  }));

  const purchases: Purchase[] = segment.purchases.map((purchase) => {
    const occurredAt = at(purchase.dayOffset, 10, 30);
    const totalCents = Math.round(
      purchase.quantity * purchase.unitCostCents,
    );
    return {
      id: `${segment.id}-purchase-${purchase.key}`,
      supplierId: supplierIds.get(purchase.supplierKey),
      productId: purchase.productKey
        ? productIds.get(purchase.productKey)
        : undefined,
      productName: purchase.productName
        ? purchase.productName
        : (segment.products.find(
            (product) => product.key === purchase.productKey,
          )?.name ?? "Compra"),
      quantity: purchase.quantity,
      unitCostCents: purchase.unitCostCents,
      totalCents,
      sourceType: "manual",
      occurredAt,
      createdAt: occurredAt,
    };
  });

  const bills: Bill[] = segment.bills.map((bill) => ({
    id: `${segment.id}-bill-${bill.key}`,
    supplierId: bill.supplierKey
      ? supplierIds.get(bill.supplierKey)
      : undefined,
    description: bill.description,
    amountCents: bill.amountCents,
    dueDate: dateOnly(bill.dueDayOffset),
    status: "open",
    paymentMethod: bill.paymentMethod,
    sourceType: "manual",
    createdAt: at(4, 9, 0),
  }));

  // Compras a prazo viram contas a pagar do mesmo jeito que no app real.
  for (const purchase of segment.purchases) {
    if (purchase.paid) continue;
    const purchaseRecord = purchases.find(
      (item) => item.id === `${segment.id}-purchase-${purchase.key}`,
    );
    if (!purchaseRecord) continue;
    const billId = `${segment.id}-bill-purchase-${purchase.key}`;
    bills.push({
      id: billId,
      supplierId: purchaseRecord.supplierId,
      description: `Compra: ${purchaseRecord.productName}`,
      amountCents: purchaseRecord.totalCents,
      dueDate: dateOnly(purchase.dueDayOffset ?? 14),
      status: "open",
      paymentMethod: purchase.paymentMethod,
      sourceType: "manual",
      createdAt: purchaseRecord.createdAt,
    });
    purchaseRecord.billId = billId;
  }

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
    version: 3,
    segmentId,
    products,
    transactions,
    inventoryLogs: [],
    suppliers,
    purchases,
    bills,
  };
}
