import { useEffect, useState } from "react";
import { Activity, CircleAlert, RefreshCw, TrendingUp } from "lucide-react";

type Summary = { completedInvoices: number; voidedInvoices: number; grossSales: string; discounts: string; netSales: string; collected: string; receivables: string; costOfGoods: string | null; grossProfit: string | null; profitAvailable: boolean };
type Report = { date: string; currency: string; summary: Summary; notes: string[] };
type Props = { storeId: string };
async function api<T>(path: string): Promise<T> { const r = await fetch(path, { credentials: "same-origin" }); if (!r.ok) { const b = await r.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(b.error?.message || "تعذر تحميل التقرير."); } return r.json() as Promise<T>; }
const money = (v: string | null, currency: string) => v === null ? "غير متاح" : `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;
export default function ReportsPage({ storeId }: Props) {
  const [report, setReport] = useState<Report | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); setError(""); try { setReport(await api<Report>(`/stores/${encodeURIComponent(storeId)}/reports/daily`)); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل التقرير."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [storeId]);
  const items = report ? [
    ["صافي المبيعات", money(report.summary.netSales, report.currency), "بعد الخصومات", "violet"],
    ["المبالغ المحصلة", money(report.summary.collected, report.currency), "المدفوع فعليًا", "green"],
    ["المبالغ المستحقة", money(report.summary.receivables, report.currency), "رصيد الفواتير", "amber"],
    ["إجمالي المبيعات", money(report.summary.grossSales, report.currency), "قبل الخصومات", "violet"],
    ["الخصومات", money(report.summary.discounts, report.currency), "خصومات الفواتير", "amber"],
    ["الربح الإجمالي", money(report.summary.grossProfit, report.currency), report.summary.profitAvailable ? "حسب التكلفة المسجلة" : "بيانات التكلفة غير مكتملة", "green"]
  ] : [];
  return <section className="products-panel">
    <div className="panel-heading"><div><h2>التقارير اليومية</h2><p>ملخص مبني على المبيعات المسجلة في قاعدة البيانات</p></div><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/> تحديث</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    {loading && <div className="report-loading">جارٍ تحميل التقرير…</div>}
    {report && <><div className="report-date"><div className="welcome-icon"><Activity/></div><div><strong>تقرير يوم {report.date}</strong><p>حدود اليوم محسوبة حسب المنطقة الزمنية للمتجر.</p></div><span className="report-invoices">{report.summary.completedInvoices.toLocaleString("ar")} فاتورة مكتملة</span></div>
      <div className="report-grid">{items.map(([label, value, note, color]) => <article className="stat-card report-card" key={label}><div className={`stat-icon ${color}`}><TrendingUp/></div><span>{label}</span><strong className="report-value">{value}</strong><small>{note}</small></article>)}</div>
      <div className="report-notes"><strong>ملاحظات التقرير</strong>{report.notes.map((note) => <p key={note}>• {note}</p>)}</div>
    </>}
  </section>;
}