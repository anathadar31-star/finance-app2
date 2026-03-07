export const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDbRTWi0xlhYtkVQ3J2O0kWaWj5GgdF3QoraA60mIDAmzA2tiu_SwMJjA0u8i-qsEPpkLeFzJbgJwl/pub?output=csv";

function parseCsv(text){
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for(let i = 0; i < text.length; i++){
    const ch = text[i];

    if(ch === '"'){
      if(inQuotes && text[i + 1] === '"'){
        cell += '"';
        i += 1;
      }else{
        inQuotes = !inQuotes;
      }
      continue;
    }

    if(ch === "," && !inQuotes){
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if((ch === "\n" || ch === "\r") && !inQuotes){
      if(ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if(row.some(v => v !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if(cell.length || row.length){
    row.push(cell.trim());
    if(row.some(v => v !== "")) rows.push(row);
  }

  return rows;
}

function normalizeHeader(value){
  return String(value || "").toLowerCase().replace(/[\s_"']/g, "");
}

function findColumn(headers, aliases){
  for(let i = 0; i < headers.length; i++){
    const current = normalizeHeader(headers[i]);
    if(aliases.some(alias => current.includes(alias))) return i;
  }
  return -1;
}

function toAmount(value){
  let cleaned = String(value || "").trim();
  if(!cleaned) return 0;

  const negativeByParens = cleaned.startsWith("(") && cleaned.endsWith(")");
  cleaned = cleaned.replace(/[₪\s]/g, "").replace(/[()]/g, "");

  if(cleaned.includes(",") && cleaned.includes(".")) cleaned = cleaned.replace(/,/g, "");
  else if(cleaned.includes(",")) cleaned = cleaned.replace(/,/g, ".");

  cleaned = cleaned.replace(/[^0-9.-]/g, "");
  let amount = Number(cleaned);
  if(!Number.isFinite(amount)) amount = 0;
  if(negativeByParens) amount = -Math.abs(amount);
  return amount;
}

function mapTransactions(rows){
  if(rows.length < 2){
    throw new Error("לא נמצאו נתונים בגיליון");
  }

  const headers = rows[0];
  const sourceIndex = findColumn(headers, ["source", "account", "card", "כרטיס", "בנק", "חשבון", "מנפיק"]);
  const dateIndex = findColumn(headers, ["date", "transactiondate", "תאריך"]);
  const descriptionIndex = findColumn(headers, ["description", "details", "desc", "תיאור", "עסקה"]);
  const categoryIndex = findColumn(headers, ["smartcategory", "category", "קטגור"]);
  const amountIndex = findColumn(headers, ["amount", "sum", "charge", "debit", "credit", "סכום", "חיוב", "זיכוי"]);

  if([dateIndex, descriptionIndex, amountIndex].includes(-1)){
    throw new Error("עמודות חובה חסרות (תאריך/תיאור/סכום)");
  }

  return rows.slice(1)
    .filter(cols => cols.some(cell => String(cell || "").trim() !== ""))
    .map(cols => ({
      source: sourceIndex > -1 ? (cols[sourceIndex] || "ללא מקור") : "ללא מקור",
      date: cols[dateIndex] || "",
      description: cols[descriptionIndex] || "",
      category: categoryIndex > -1 && cols[categoryIndex] ? cols[categoryIndex] : "ללא קטגוריה",
      amount: toAmount(cols[amountIndex])
    }));
}

export async function loadMasterTransactions(){
  const response = await fetch(MASTER_CSV_URL);
  if(!response.ok) throw new Error(`HTTP ${response.status}`);

  const csvText = (await response.text()).replace(/^\uFEFF/, "");
  const rows = parseCsv(csvText);
  return mapTransactions(rows);
}

export function buildAnalytics(transactions){
  const total = transactions.reduce((sum, item) => sum + item.amount, 0);
  const expenses = transactions.filter(t => t.amount < 0).reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const income = transactions.filter(t => t.amount > 0).reduce((sum, item) => sum + item.amount, 0);

  const byCategory = {};
  for(const t of transactions){
    byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
  }

  return { total, expenses, income, byCategory };
}
