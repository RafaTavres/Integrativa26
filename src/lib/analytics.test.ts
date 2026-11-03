import { describe, expect, it } from "vitest";
import { dueDateLabel, summarizePayables } from "./analytics";
import type { Bill, Supplier } from "./types";

const now = new Date(2026, 10, 3, 12);

describe("dueDateLabel", () => {
  it("rotula hoje, amanhã e atraso", () => {
    expect(dueDateLabel("2026-11-03", now)).toBe("Vence hoje");
    expect(dueDateLabel("2026-11-04", now)).toBe("Vence amanhã");
    expect(dueDateLabel("2026-11-01", now)).toBe("Atrasada 2 dias");
  });
});

describe("summarizePayables", () => {
  it("separa atrasadas, próximas e pagas", () => {
    const bills: Bill[] = [
      {
        id: "1",
        description: "Atrasada",
        amountCents: 1000,
        dueDate: "2026-11-01",
        status: "open",
        sourceType: "manual",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "2",
        description: "Hoje",
        amountCents: 2000,
        dueDate: "2026-11-03",
        status: "open",
        sourceType: "manual",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
      {
        id: "3",
        description: "Paga",
        amountCents: 3000,
        dueDate: "2026-11-02",
        status: "paid",
        sourceType: "manual",
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ];
    const suppliers: Supplier[] = [];
    const summary = summarizePayables(bills, suppliers, now);

    expect(summary.openTotalCents).toBe(3000);
    expect(summary.openCount).toBe(2);
    expect(summary.overdueTotalCents).toBe(1000);
    expect(summary.dueTodayTotalCents).toBe(2000);
    expect(summary.next7TotalCents).toBe(2000);
  });
});
