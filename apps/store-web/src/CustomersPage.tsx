import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, Plus, Search, Users, X } from "lucide-react";

type Customer = { id: string; name: string; phone?: string | null; email?: string | null; creditLimit: string | number; creditBalance: string | number };
type Props = { storeId: string; currency: string };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ الطلب.");
  }
  return response.json() as Promise<T>;
}
const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;

export default function CustomersPage({ storeId, currency }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", creditLimit: "0" });
  async function load() {
    const result = await api<{ customers: Customer[] }>(`/stores/${encodeURIComponent(storeId)}/customers?page=1&pageSize=100`);
    setCustomers(result.customers);
  }
  useEffect(() => { setError(""); void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "تعذر تحميل العملاء.")); }, [storeId]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return customers.filter((c) => [c.name, c.phone || "", c.email || ""].some((v) => v.toLocaleLowerCase().includes(q)));
  }, [customers, query]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api(`/stores/${encodeURIComponent(storeId)}/customers`, { method: "POST", body: JSON.stringify({ name: form.name.trim(), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}), ...(form.email.trim() ? { email: form.email.trim() } : {}), creditLimit: form.creditLimit }) });
      setForm({ name: "", phone: "", email: "", creditLimit: "0" }); setShowForm(false); setNotice("تمت إضافة العميل بنجاح."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة العميل."); }
    finally { setBusy(false); }
  }
  return <section className="products-panel">
    <div className="panel-heading"><div><h2>العملاء</h2><p>بيانات العملاء وحدود الائتمان والأرصدة من قاعدة البيانات</p></div><button className="primary" onClick={() => setShowForm((v) => !v)}><Plus size={17} /> عميل جديد</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {showForm && <form className="product-form" onSubmit={create}><div className="form-title"><h3>إضافة عميل</h3><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setShowForm(false)}><X size={16}/></button></div>
      <label>اسم العميل *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={180}/></label>
      <label>رقم الهاتف<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40}/></label>
      <label>البريد الإلكتروني<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={254}/></label>
      <label>حد الائتمان<input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} required/></label>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>إلغاء</button><button className="primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ العميل"}</button></div>
    </form>}
    <div className="table-tools"><label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف أو البريد…"/></label><span>{visible.length.toLocaleString("ar")} عميل</span></div>
    <div className="table-wrap"><table><thead><tr><th>العميل</th><th>بيانات الاتصال</th><th>حد الائتمان</th><th>الرصيد المستحق</th><th>الحالة</th></tr></thead><tbody>
      {visible.map((c) => <tr key={c.id}><td><div className="product-name"><div className="product-thumb"><Users size={17}/></div><div><strong>{c.name}</strong><small>عميل مسجل</small></div></div></td><td>{c.phone || "—"}<small className="contact-sub">{c.email || ""}</small></td><td>{money(c.creditLimit, currency)}</td><td className="price-cell">{money(c.creditBalance, currency)}</td><td><span className={Number(c.creditBalance) > 0 ? "status low" : "status good"}><span/>{Number(c.creditBalance) > 0 ? "عليه رصيد" : "دون مديونية"}</span></td></tr>)}
      {visible.length === 0 && <tr><td colSpan={5}><div className="table-empty"><Users size={25}/><strong>{query ? "لا توجد نتائج مطابقة" : "لا يوجد عملاء حتى الآن"}</strong><span>يمكنك إضافة عميل من الزر أعلاه.</span></div></td></tr>}
    </tbody></table></div><div className="panel-foot"><span>عرض أول 100 عميل. الأرصدة تُقرأ من الخادم ولا تُعدّل من الواجهة.</span></div>
  </section>;
}