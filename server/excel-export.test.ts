import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildLiveMonitorWorkbook, buildTradeHistoryWorkbook } from "./excel-export";

describe("TMT Excel exports", () => {
  it("creates the history workbook with the reference sheets and TRADES header contract", async () => {
    const file = await buildTradeHistoryWorkbook([{ closedAt: new Date("2026-08-12T11:41:18Z"), ceSymbol: "C-BTC-64000-120826", peSymbol: "P-BTC-63800-120826", lots: 120, ceEntry: "72.5", peEntry: "126.13", ceExit: "119.15", peExit: "1", pnlUsd: "9.42", feesInr: "82", netInr: "700", note: "Verified close" }]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["TRADES", "DAILY", "WEEKLY", "MONTHLY"]);
    expect(workbook.getWorksheet("TRADES")?.getRow(1).values.slice(1)).toEqual(["Close Time (IST)", "Date", "Underlying", "CE Symbol", "PE Symbol", "Lots", "CE Entry", "CE Exit", "PE Entry", "PE Exit", "P&L USD", "P&L INR", "Fees INR", "Net INR", "Note"]);
    expect(workbook.getWorksheet("TRADES")?.getRow(2).getCell(3).value).toBe("BTC");
  });

  it("creates the live monitor workbook with the reference LIVE P&L header contract", async () => {
    const file = await buildLiveMonitorWorkbook(null);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["LIVE P&L"]);
    expect(workbook.getWorksheet("LIVE P&L")?.getRow(1).values.slice(1)).toEqual(["Time (IST)", "Underlying Price $", "CE Entry", "CE Current", "CE SL", "PE Entry", "PE Current", "PE SL", "P&L USD", "P&L INR", "Brokerage ₹", "Net ₹", "Status"]);
  });

  it("labels a Gold/XAUT live-monitor export with its selected underlying", async () => {
    const file = await buildLiveMonitorWorkbook({ capturedAt: new Date("2026-08-12T11:41:18Z"), underlyingLabel: "GOLD / XAUT", spot: "4300", ceEntry: "82", peEntry: "61", ceStop: "164", peStop: "122", ceMark: "70", peMark: "52", pnlUsd: "0.06", pnlInr: "4.98", feesInr: "2.1", netInr: "2.88", status: "IN PROFIT" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file);
    expect(workbook.getWorksheet("LIVE P&L")?.getRow(1).getCell(2).value).toBe("GOLD / XAUT Price $");
  });
});
