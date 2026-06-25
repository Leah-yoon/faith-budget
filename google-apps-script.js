const SPREADSHEET_ID = "1UnHAL5fSRHO7ahBFgG8L4uuwDoyt33OPDgJrSKHsow4";

const SHEETS = {
  budget: "예산",
  expenses: "지출기록",
  summary: "월별요약",
  snapshot: "앱데이터",
  snapshotBackup: "앱데이터백업",
};

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");

  if (payload.type === "expense") {
    appendExpense(payload);
  }

  if (payload.type === "income" || payload.type === "heaven") {
    appendEntry(payload);
  }

  if (payload.type === "budget") {
    saveBudget(payload);
  }

  if (payload.type === "snapshot") {
    saveSnapshot(payload.snapshot || {});
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = e.parameter || {};

  if (params.type === "budget") {
    return jsonp(params.callback, getBudget(params.month || ""));
  }

  if (params.type === "snapshot") {
    return jsonp(params.callback, getSnapshot());
  }

  return jsonp(params.callback, { ok: true });
}

function jsonp(callback, payload) {
  const name = callback || "callback";
  return ContentService
    .createTextOutput(`${name}(${JSON.stringify(payload)})`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getBudget(month) {
  const sheet = getOrCreateSheet(SHEETS.budget, ["월", "분류", "항목", "예산", "지난달이월", "이번달수입", "저장시간"]);
  const lastRow = sheet.getLastRow();
  const result = {
    month,
    carryover: 0,
    income: 0,
    rows: [],
  };

  if (lastRow <= 1) return result;

  const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  values.forEach((row) => {
    if (row[0] !== month) return;
    result.rows.push({
      category: row[1] || "",
      item: row[2] || "",
      budget: Number(row[3] || 0),
    });
    result.carryover = Number(row[4] || 0);
    result.income = Number(row[5] || 0);
  });

  return result;
}

function saveBudget(payload) {
  const sheet = getOrCreateSheet(SHEETS.budget, ["월", "분류", "항목", "예산", "지난달이월", "이번달수입", "저장시간"]);
  const month = payload.month || "";
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const months = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let index = months.length - 1; index >= 0; index -= 1) {
      if (months[index][0] === month) {
        sheet.deleteRow(index + 2);
      }
    }
  }

  (payload.rows || []).forEach((row) => {
    sheet.appendRow([
      month,
      row.category || "",
      row.item || "",
      Number(row.budget || 0),
      Number(payload.carryover || 0),
      Number(payload.income || 0),
      new Date(),
    ]);
  });
}

function appendExpense(payload) {
  const sheet = getOrCreateSheet(SHEETS.expenses, ["날짜", "월", "분류", "항목", "금액", "메모", "입력자", "입력시간"]);
  sheet.appendRow([
    payload.date || "",
    payload.month || "",
    payload.category || "",
    payload.item || "",
    Number(payload.amount || 0),
    payload.memo || "",
    payload.user || "나",
    new Date(),
  ]);
}

function appendEntry(payload) {
  const sheet = getOrCreateSheet("입력기록", ["날짜", "월", "종류", "분류", "항목", "금액", "메모", "입력자", "입력시간"]);
  const entryType = payload.type === "income"
    ? "수입"
    : payload.item === "거둔 기록"
      ? "하늘은행통장-거둠"
      : "하늘은행통장-심음";
  sheet.appendRow([
    payload.date || "",
    payload.month || "",
    entryType,
    payload.category || "",
    payload.item || "",
    Number(payload.amount || 0),
    payload.memo || "",
    payload.user || "나",
    new Date(),
  ]);
}

function saveSnapshot(snapshot) {
  if (!snapshotHasData(snapshot)) {
    return;
  }

  const sheet = getOrCreateSheet(SHEETS.snapshot, ["키", "데이터", "저장시간"]);
  const backupSheet = getOrCreateSheet(SHEETS.snapshotBackup, ["키", "데이터", "저장시간"]);
  const json = JSON.stringify(snapshot || {});
  const savedAt = new Date();

  backupSheet.appendRow(["backup", json, savedAt]);

  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, 1, 3).setValues([["latest", json, savedAt]]);
    return;
  }

  sheet.appendRow(["latest", json, savedAt]);
}

function snapshotHasData(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  const months = snapshot.months || {};
  const hasMonthData = Object.keys(months).some((monthKey) => {
    const month = months[monthKey] || {};
    const hasExpenses = (month.expenses || []).length > 0;
    const hasIncomes = (month.incomes || []).length > 0;
    const hasHeaven = (month.heaven || []).length > 0;
    const itemGroups = month.items || {};
    const hasBudget = Object.keys(itemGroups).some((categoryKey) =>
      (itemGroups[categoryKey] || []).some((item) => item.name || Number(item.budget || 0) > 0),
    );
    return hasExpenses || hasIncomes || hasHeaven || hasBudget || Number(month.carryover || 0) > 0;
  });

  return hasMonthData || (snapshot.wishes || []).length > 0 || (snapshot.debts || []).length > 0;
}

function getSnapshot() {
  const sheet = getOrCreateSheet(SHEETS.snapshot, ["키", "데이터", "저장시간"]);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, snapshot: null };
  }

  const json = sheet.getRange(2, 2).getValue();
  try {
    return { ok: true, snapshot: JSON.parse(json || "null") };
  } catch (error) {
    return { ok: false, snapshot: null, error: "snapshot parse failed" };
  }
}

function getOrCreateSheet(name, header) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }

  return sheet;
}
