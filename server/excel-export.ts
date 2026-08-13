import ExcelJS from "exceljs";

type ClosedTradeRow = {
  closedAt: Date;
  ceSymbol: string;
  peSymbol: string;
  lots: number;
  ceEntry: string;
  peEntry: string;
  ceExit: string;
  peExit: string;
  pnlUsd: string;
  feesInr: string;
  netInr: string;
  note: string | null;
};

type LiveRow = {
  capturedAt: Date;
  spot: string;
  ceEntry: string;
  peEntry: string;
  ceStop: string;
  peStop: string;
  ceMark: string;
  peMark: string;
  pnlUsd: string;
  pnlInr: string;
  feesInr: string;
  netInr: string;
  status: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const timestampFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const number = (value: string) => Number(value);

function formatTimestamp(value: Date) {
  const parts = Object.fromEntries(timestampFormatter.formatToParts(value).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDate(value: Date) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(value).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isoWeek(value: Date) {
  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const weekStart = new Date(utc);
  weekStart.setUTCDate(utc.getUTCDate() - 3);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return { key: `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`, start: formatDate(weekStart), end: formatDate(weekEnd) };
}

function styleHeader(worksheet: ExcelJS.Worksheet) {
  const row = worksheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1E" } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + worksheet.columnCount)}1` };
}

function finalizeWorksheet(worksheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  for (let row = 2; row <= worksheet.rowCount; row += 1) {
    worksheet.getRow(row).alignment = { vertical: "top", wrapText: true };
  }
}

export async function buildTradeHistoryWorkbook(trades: ClosedTradeRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TMT Trading Dashboard";
  workbook.created = new Date();

  const tradesSheet = workbook.addWorksheet("TRADES");
  tradesSheet.addRow(["Close Time (IST)", "Date", "CE Symbol", "PE Symbol", "Lots", "CE Entry", "CE Exit", "PE Entry", "PE Exit", "P&L USD", "P&L INR", "Fees INR", "Net INR", "Note"]);
  for (const trade of trades) {
    const grossInr = number(trade.netInr) + number(trade.feesInr);
    tradesSheet.addRow([formatTimestamp(trade.closedAt), formatDate(trade.closedAt), trade.ceSymbol, trade.peSymbol, trade.lots, number(trade.ceEntry), number(trade.ceExit), number(trade.peEntry), number(trade.peExit), number(trade.pnlUsd), grossInr, number(trade.feesInr), number(trade.netInr), trade.note ?? ""]);
  }
  styleHeader(tradesSheet);
  finalizeWorksheet(tradesSheet, [21, 13, 25, 25, 8, 11, 11, 11, 11, 12, 12, 12, 12, 48]);
  [6, 7, 8, 9, 10, 11, 12, 13].forEach(column => { tradesSheet.getColumn(column).numFmt = "0.00"; });

  const daily = new Map<string, { trades: number; net: number; gross: number }>();
  const weekly = new Map<string, { start: string; end: string; trades: number; net: number; gross: number }>();
  const monthly = new Map<string, { trades: number; net: number; gross: number }>();
  for (const trade of trades) {
    const date = formatDate(trade.closedAt);
    const gross = number(trade.netInr) + number(trade.feesInr);
    const dailyRow = daily.get(date) ?? { trades: 0, net: 0, gross: 0 };
    dailyRow.trades += 1; dailyRow.net += number(trade.netInr); dailyRow.gross += gross; daily.set(date, dailyRow);
    const info = isoWeek(trade.closedAt);
    const weeklyRow = weekly.get(info.key) ?? { start: info.start, end: info.end, trades: 0, net: 0, gross: 0 };
    weeklyRow.trades += 1; weeklyRow.net += number(trade.netInr); weeklyRow.gross += gross; weekly.set(info.key, weeklyRow);
    const month = date.slice(0, 7);
    const monthlyRow = monthly.get(month) ?? { trades: 0, net: 0, gross: 0 };
    monthlyRow.trades += 1; monthlyRow.net += number(trade.netInr); monthlyRow.gross += gross; monthly.set(month, monthlyRow);
  }

  const dailySheet = workbook.addWorksheet("DAILY");
  dailySheet.addRow(["Date", "Trades", "Net INR", "Gross INR"]);
  Array.from(daily.entries()).sort(([left], [right]) => left.localeCompare(right)).forEach(([date, row]) => dailySheet.addRow([date, row.trades, row.net, row.gross]));
  styleHeader(dailySheet); finalizeWorksheet(dailySheet, [15, 10, 14, 14]); dailySheet.getColumn(3).numFmt = "0.00"; dailySheet.getColumn(4).numFmt = "0.00";

  const weeklySheet = workbook.addWorksheet("WEEKLY");
  weeklySheet.addRow(["Week (Mon-Sun)", "Week Start", "Week End", "Trades", "Net INR", "Gross INR"]);
  Array.from(weekly.entries()).sort(([left], [right]) => left.localeCompare(right)).forEach(([week, row]) => weeklySheet.addRow([week, row.start, row.end, row.trades, row.net, row.gross]));
  styleHeader(weeklySheet); finalizeWorksheet(weeklySheet, [18, 15, 15, 10, 14, 14]); weeklySheet.getColumn(5).numFmt = "0.00"; weeklySheet.getColumn(6).numFmt = "0.00";

  const monthlySheet = workbook.addWorksheet("MONTHLY");
  monthlySheet.addRow(["Month", "Trades", "Net INR", "Gross INR"]);
  Array.from(monthly.entries()).sort(([left], [right]) => left.localeCompare(right)).forEach(([month, row]) => monthlySheet.addRow([month, row.trades, row.net, row.gross]));
  styleHeader(monthlySheet); finalizeWorksheet(monthlySheet, [14, 10, 14, 14]); monthlySheet.getColumn(3).numFmt = "0.00"; monthlySheet.getColumn(4).numFmt = "0.00";

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildLiveMonitorWorkbook(row: LiveRow | null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TMT Trading Dashboard";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("LIVE P&L");
  worksheet.addRow(["Time (IST)", "BTC Price $", "CE Entry", "CE Current", "CE SL", "PE Entry", "PE Current", "PE SL", "P&L USD", "P&L INR", "Brokerage ₹", "Net ₹", "Status"]);
  if (row) {
    worksheet.addRow([formatTimestamp(row.capturedAt), number(row.spot), number(row.ceEntry), number(row.ceMark), number(row.ceStop), number(row.peEntry), number(row.peMark), number(row.peStop), number(row.pnlUsd), number(row.pnlInr), number(row.feesInr), number(row.netInr), row.status]);
  }
  styleHeader(worksheet);
  finalizeWorksheet(worksheet, [21, 14, 12, 13, 11, 12, 13, 11, 12, 12, 14, 12, 28]);
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(column => { worksheet.getColumn(column).numFmt = "0.00"; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
