import type {
  Bill,
  Business,
  DemoState,
  InventoryLog,
  Product,
  Purchase,
  Supplier,
  Transaction,
} from "./types";

interface ExportPayload {
  app: "Estokar";
  version: 1;
  exportedAt: string;
  business: Business;
  segmentId: DemoState["segmentId"];
  products: Product[];
  transactions: Transaction[];
  inventoryLogs: InventoryLog[];
  suppliers: Supplier[];
  purchases: Purchase[];
  bills: Bill[];
}

export function workspaceExport(
  business: Business,
  state: Omit<DemoState, "version">,
): ExportPayload {
  return {
    app: "Estokar",
    version: 1,
    exportedAt: new Date().toISOString(),
    business,
    ...state,
  };
}

/** Baixa um retrato dos dados no navegador, sem chamar o servidor. */
export function downloadWorkspaceJson(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `estokar-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
