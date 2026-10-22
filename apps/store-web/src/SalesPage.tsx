import { useEffect, useState } from "react";
import { CircleAlert, Receipt, RefreshCw } from "lucide-react";

type Sale = { id: string; invoiceNumber: string; status: string; paymentStatus: string; totalAmount: string | number; paidAmount: string | number; balanceDue: string | number; paymentMethod: string; createdAt: string; customer?: { name: string; phone?: string | null } | null; _count: { items: number } };
type Props = { storeId: string; currency: string };
async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(body.error?.message || "تعذر تحميل المبيعات."); }
  return response.json() as Promise<T>;
}
const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;
const paymentLabel: Record<string, string> = { PAID: "مدفوعة", PARTIAL: "مدفوعة جزئيًا", UNPAID: "غير مدفوعة" };
const methodLabel: Record<string, string> = { CASH: "نقدًا", CARD: "بطاقة", TRANSFER: "تحويل", CREDIT: "آجل" };

export default function SalesPage({ storeId, currency }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); setError(""); try { const result = await api<{ sales: Sale[] }>(`/stores/${encodeURIComponent(storeId)}/sales?page=1&pageSize=100`); setSales(result.sales); } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المبيعات."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [storeId]);
  return <section className="products-panel">
    <div className="panel-heading"><div><h2>المبيعات والفواتير</h2><p>الفواتير وحالة التحصيل من بيانات المتجر</p></div><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/> تحديث</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    <div className="table-tools"><span>{sales.length.toLocaleString("ar")} فاتورة محمّلة</span><span>{loading ? "جارٍ التحميل…" : "بيانات مباشرة"}</span></div>
    <div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>التحصيل</th></tr></thead><tbody>
      {sales.map((sale) => <tr key={sale.id}><td><div className="product-name"><div className="product-thumb"><Receipt size={17}/></div><div><strong>{sale.invoiceNumber}</strong><small>{sale._count.items.toLocaleString("ar")} بند · {methodLabel[sale.paymentMethod] || sale.paymentMethod}</small></div></div></td><td>{sale.customer?.name || "عميل نقدي"}<small className="contact-sub">{sale.customer?.phone || ""}</small></td><td>{new Date(sale.createdAt).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" })}</td><td className="price-cell">{money(sale.totalAmount, currency)}</td><td>{money(sale.paidAmount, currency)}</td><td>{money(sale.balanceDue, currency)}</td><td><span className={sale.paymentStatus === "PAID" ? "status good" : "status low"}><span/>{paymentLabel[sale.paymentStatus] || sale.paymentStatus}</span></td></tr>)}
      {!loading && sales.length === 0 && <tr><td colSpan={7}><div className="table-empty"><Receipt size={25}/><strong>لا توجد فواتير لعرضها</strong><span>ستظهر الفواتير هنا بعد تسجيل المبيعات.</span></div></td></tr>}
    </tbody></table></div><div className="panel-foot"><span>عرض آخر 100 فاتورة. تسجيل البيع يتم عبر واجهة API المحمية، وليس من هذه الصفحة بعد.</span></div>
  </section>;
}