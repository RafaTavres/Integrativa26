import type {
  Bill,
  Product,
  Purchase,
  Supplier,
  Transaction,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

export function addDaysToDateOnly(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function daysUntil(value: string, now = new Date()): number {
  const due = parseDateOnly(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

export function dueDateLabel(value: string, now = new Date()): string {
  const diff = daysUntil(value, now);
  if (diff === 0) return "Vence hoje";
  if (diff === 1) return "Vence amanhã";
  if (diff === -1) return "Atrasada 1 dia";
  if (diff < -1) return `Atrasada ${Math.abs(diff)} dias`;
  return `Vence em ${diff} dias`;
}

export function formatDateOnly(value: string): string {
  const date = parseDateOnly(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(".", "");
}

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

export interface PayableBySupplier {
  supplierId?: string;
  supplierName: string;
  totalCents: number;
  count: number;
  nextDueDate?: string;
}

export interface PayableTimelineItem {
  dueDate: string;
  totalCents: number;
  bills: Bill[];
}

export interface PayableSummary {
  openTotalCents: number;
  openCount: number;
  overdueTotalCents: number;
  overdueCount: number;
  dueTodayTotalCents: number;
  dueTodayCount: number;
  next7TotalCents: number;
  next7Count: number;
  next30TotalCents: number;
  next30Count: number;
  nextPayment?: {
    dueDate: string;
    totalCents: number;
    count: number;
  };
  bySupplier: PayableBySupplier[];
  timeline: PayableTimelineItem[];
}

export function summarizePayables(
  bills: Bill[],
  suppliers: Supplier[],
  now = new Date(),
): PayableSummary {
  const supplierName = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const open = bills.filter((bill) => bill.status === "open");
  const bySupplierMap = new Map<string, PayableBySupplier>();
  const timelineMap = new Map<string, Bill[]>();

  const summary: PayableSummary = {
    openTotalCents: 0,
    openCount: open.length,
    overdueTotalCents: 0,
    overdueCount: 0,
    dueTodayTotalCents: 0,
    dueTodayCount: 0,
    next7TotalCents: 0,
    next7Count: 0,
    next30TotalCents: 0,
    next30Count: 0,
    bySupplier: [],
    timeline: [],
  };

  for (const bill of open) {
    const diff = daysUntil(bill.dueDate, now);
    summary.openTotalCents += bill.amountCents;

    if (diff < 0) {
      summary.overdueTotalCents += bill.amountCents;
      summary.overdueCount += 1;
    }
    if (diff === 0) {
      summary.dueTodayTotalCents += bill.amountCents;
      summary.dueTodayCount += 1;
    }
    if (diff >= 0 && diff <= 7) {
      summary.next7TotalCents += bill.amountCents;
      summary.next7Count += 1;
    }
    if (diff >= 0 && diff <= 30) {
      summary.next30TotalCents += bill.amountCents;
      summary.next30Count += 1;
    }

    if (!summary.nextPayment || bill.dueDate < summary.nextPayment.dueDate) {
      summary.nextPayment = {
        dueDate: bill.dueDate,
        totalCents: bill.amountCents,
        count: 1,
      };
    } else if (summary.nextPayment.dueDate === bill.dueDate) {
      summary.nextPayment.totalCents += bill.amountCents;
      summary.nextPayment.count += 1;
    }

    const supplierKey = bill.supplierId ?? "__none";
    const current = bySupplierMap.get(supplierKey) ?? {
      supplierId: bill.supplierId,
      supplierName: bill.supplierId
        ? (supplierName.get(bill.supplierId) ?? "Fornecedor removido")
        : "Sem fornecedor",
      totalCents: 0,
      count: 0,
    };
    current.totalCents += bill.amountCents;
    current.count += 1;
    if (!current.nextDueDate || bill.dueDate < current.nextDueDate) {
      current.nextDueDate = bill.dueDate;
    }
    bySupplierMap.set(supplierKey, current);

    const timeline = timelineMap.get(bill.dueDate) ?? [];
    timeline.push(bill);
    timelineMap.set(bill.dueDate, timeline);
  }

  summary.bySupplier = [...bySupplierMap.values()].sort((a, b) => {
    const aDate = a.nextDueDate ?? "9999-12-31";
    const bDate = b.nextDueDate ?? "9999-12-31";
    return aDate.localeCompare(bDate);
  });

  summary.timeline = [...timelineMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dueDate, group]) => ({
      dueDate,
      totalCents: group.reduce((total, bill) => total + bill.amountCents, 0),
      bills: group.sort((a, b) => a.description.localeCompare(b.description)),
    }));

  return summary;
}

// ---------------------------------------------------------------------------
// Estoque parado
// ---------------------------------------------------------------------------

export interface DeadStockItem {
  product: Product;
  daysWithoutSale: number;
  lastSaleAt?: string;
  tiedUpCents: number;
}

export interface DeadStockSummary {
  items: DeadStockItem[];
  totalTiedUpCents: number;
  thresholdDays: number;
}

export function summarizeDeadStock(
  products: Product[],
  transactions: Transaction[],
  thresholdDays = 30,
  now = new Date(),
): DeadStockSummary {
  const lastSaleByProduct = new Map<string, string>();

  for (const transaction of transactions) {
    if (
      transaction.kind !== "sale" ||
      transaction.status !== "processed" ||
      !transaction.productId
    ) {
      continue;
    }
    const current = lastSaleByProduct.get(transaction.productId);
    if (
      !current ||
      new Date(transaction.occurredAt).getTime() > new Date(current).getTime()
    ) {
      lastSaleByProduct.set(transaction.productId, transaction.occurredAt);
    }
  }

  const items: DeadStockItem[] = [];

  for (const product of products) {
    if (!product.trackStock || product.stock <= 0) continue;
    const lastSaleAt = lastSaleByProduct.get(product.id);
    const reference = lastSaleAt ? new Date(lastSaleAt) : new Date(product.createdAt);
    const daysWithoutSale = Math.max(
      0,
      Math.floor((now.getTime() - reference.getTime()) / DAY_MS),
    );
    if (daysWithoutSale < thresholdDays) continue;
    items.push({
      product,
      daysWithoutSale,
      lastSaleAt,
      tiedUpCents: Math.round(product.stock * product.costCents),
    });
  }

  items.sort((a, b) => b.tiedUpCents - a.tiedUpCents);

  return {
    items,
    totalTiedUpCents: items.reduce(
      (total, item) => total + item.tiedUpCents,
      0,
    ),
    thresholdDays,
  };
}

// ---------------------------------------------------------------------------
// Preço por fornecedor
// ---------------------------------------------------------------------------

export interface SupplierPrice {
  supplierId?: string;
  supplierName: string;
  unitCostCents: number;
  quantity: number;
  purchasedAt: string;
}

export interface PriceComparison {
  key: string;
  productId?: string;
  productName: string;
  purchaseCount: number;
  suppliers: SupplierPrice[];
  best?: SupplierPrice;
  worst?: SupplierPrice;
  latest?: SupplierPrice;
  /** Quanto dá para economizar por unidade comprando do melhor fornecedor. */
  savingsPerUnitCents: number;
  spreadPct: number;
}

export function buildPriceComparisons(
  purchases: Purchase[],
  products: Product[],
  suppliers: Supplier[],
): PriceComparison[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const supplierById = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  const groups = new Map<
    string,
    {
      productId?: string;
      productName: string;
      bySupplier: Map<string, SupplierPrice>;
      count: number;
      latest?: SupplierPrice;
    }
  >();

  for (const purchase of purchases) {
    const product = purchase.productId
      ? productById.get(purchase.productId)
      : undefined;
    const key =
      purchase.productId ??
      `nome:${purchase.productName.trim().toLowerCase()}`;
    const group = groups.get(key) ?? {
      productId: purchase.productId,
      productName: product?.name ?? purchase.productName,
      bySupplier: new Map<string, SupplierPrice>(),
      count: 0,
    };

    group.count += 1;
    const supplierKey = purchase.supplierId ?? "__none";
    const price: SupplierPrice = {
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierId
        ? (supplierById.get(purchase.supplierId) ?? "Fornecedor removido")
        : "Sem fornecedor",
      unitCostCents: purchase.unitCostCents,
      quantity: purchase.quantity,
      purchasedAt: purchase.occurredAt,
    };
    const current = group.bySupplier.get(supplierKey);
    if (
      !current ||
      new Date(price.purchasedAt).getTime() >=
        new Date(current.purchasedAt).getTime()
    ) {
      group.bySupplier.set(supplierKey, price);
    }
    if (
      !group.latest ||
      new Date(price.purchasedAt).getTime() >
        new Date(group.latest.purchasedAt).getTime()
    ) {
      group.latest = price;
    }
    groups.set(key, group);
  }

  const comparisons: PriceComparison[] = [];

  for (const [key, group] of groups) {
    const suppliersList = [...group.bySupplier.values()].sort(
      (a, b) => a.unitCostCents - b.unitCostCents,
    );
    if (suppliersList.length === 0) continue;
    const best = suppliersList[0];
    const worst = suppliersList[suppliersList.length - 1];
    const savings = Math.max(0, worst.unitCostCents - best.unitCostCents);
    comparisons.push({
      key,
      productId: group.productId,
      productName: group.productName,
      purchaseCount: group.count,
      suppliers: suppliersList,
      best,
      worst,
      latest: group.latest,
      savingsPerUnitCents: savings,
      // Percentual economizado em relação ao preço mais caro. É o que a tela
      // mostra como "até X% mais barato".
      spreadPct:
        worst.unitCostCents > 0
          ? Math.round((savings / worst.unitCostCents) * 100)
          : 0,
    });
  }

  return comparisons.sort((a, b) =>
    a.productName.localeCompare(b.productName, "pt-BR"),
  );
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export interface SupplierOverview extends Supplier {
  openTotalCents: number;
  openCount: number;
  purchaseCount: number;
  lastPurchaseAt?: string;
  productNames: string[];
}

export function buildSupplierOverview(
  suppliers: Supplier[],
  bills: Bill[],
  purchases: Purchase[],
): SupplierOverview[] {
  return suppliers
    .map((supplier) => {
      const open = bills.filter(
        (bill) => bill.status === "open" && bill.supplierId === supplier.id,
      );
      const supplierPurchases = purchases.filter(
        (purchase) => purchase.supplierId === supplier.id,
      );
      const lastPurchase = supplierPurchases.reduce<Purchase | undefined>(
        (latest, purchase) =>
          !latest ||
          new Date(purchase.occurredAt).getTime() >
            new Date(latest.occurredAt).getTime()
            ? purchase
            : latest,
        undefined,
      );
      const productNames = [
        ...new Set(supplierPurchases.map((purchase) => purchase.productName)),
      ];

      return {
        ...supplier,
        openTotalCents: open.reduce(
          (total, bill) => total + bill.amountCents,
          0,
        ),
        openCount: open.length,
        purchaseCount: supplierPurchases.length,
        lastPurchaseAt: lastPurchase?.occurredAt,
        productNames,
      };
    })
    .sort((a, b) => {
      if (a.openTotalCents !== b.openTotalCents) {
        return b.openTotalCents - a.openTotalCents;
      }
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

// ---------------------------------------------------------------------------
// Retiradas
// ---------------------------------------------------------------------------

export interface WithdrawalSummary {
  monthTotalCents: number;
  last30TotalCents: number;
  count: number;
  items: Transaction[];
}

export function summarizeWithdrawals(
  transactions: Transaction[],
  now = new Date(),
): WithdrawalSummary {
  const withdrawals = transactions
    .filter(
      (transaction) =>
        transaction.kind === "withdrawal" &&
        transaction.status === "processed",
    )
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;

  return {
    monthTotalCents: withdrawals
      .filter(
        (transaction) =>
          new Date(transaction.occurredAt).getTime() >= startOfMonth,
      )
      .reduce((total, transaction) => total + transaction.amountCents, 0),
    last30TotalCents: withdrawals
      .filter(
        (transaction) =>
          new Date(transaction.occurredAt).getTime() >= thirtyDaysAgo,
      )
      .reduce((total, transaction) => total + transaction.amountCents, 0),
    count: withdrawals.length,
    items: withdrawals,
  };
}
