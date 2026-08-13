import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildLiveMonitorWorkbook, buildTradeHistoryWorkbook } from "./excel-export";

describe("TMT Excel exports", () => {
  it("creates the history workbook with the reference sheets and TRADES header contract", async () => {
    const file = await buildTradeHistoryWorkbook([{ closedAt: new Date("2026-08-12T11:41:18Z"), ceSymbol: "C-BTC-64000-120826", peSymbol: "P-BTC-63800-120826", lots: 120, ceEntry: "72.5", peEntry: "126.13", ceExit: "119.15", peExit: "1", pnlUsd: "9.42", feesInr: "82", netInr: "700", note: "Verified close" }]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["TRADES", "DAILY", "WEEKLY", "MONTHLY"]);
    expect(workbook.getWorksheet("TRADES")?.getRow(1).values.slice(1)).toEqual(["Close Time (IST)", "Date", "CE Symbol", "PE Symbol", "Lots", "CE Entry", "CE Exit", "PE Entry", "PE Exit", "P&L USD", "P&L INR", "Fees INR", "Net INR", "Note"]);
  });

  it("creates the live monitor workbook with the reference LIVE P&L header contract", async () => {
    const file = await buildLiveMonitorWorkbook(null);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["LIVE P&L"]);
    expect(workbook.getWorksheet("LIVE P&L")?.getRow(1).values.slice(1)).toEqual(["Time (IST)", "BTC Price $", "CE Entry", "CE Current", "CE SL", "PE Entry", "PE Current", "PE SL", "P&L USD", "P&L INR", "Brokerage ₹", "Net ₹", "Status"]);
  });
});
