# تقييم المستودعات وقرار الأساس التقني

**التاريخ:** 2026-10-16

## الحالة

المستودع https://github.com/Zain1970/Supermarket فارغ وقت الفحص، لذلك لا يوجد كود قائم يلزم الحفاظ عليه.

## مقارنة أولية

| المرشح | الترخيص | ملاءمة تقنية | الفائدة المحتملة | المخاطر/الفجوات | القرار |
|---|---|---|---|---|---|
| [multi-tenant-pos-saas](https://github.com/ZineddineBk09/multi-tenant-pos-saas) | MIT | متوسطة؛ Next.js/Fastify/Drizzle بدل Express/Prisma | أفكار RLS وعزل المستأجرين وmonorepo وتوثيق | نطاق POS ومخزون، لا يغطي كامل التطبيقات والاشتراكات؛ لم تُشغّل الاختبارات | مرجع معماري فقط |
| [retail-smart-erp](https://github.com/ravindu2012/retail-smart-erp) | GPL-3.0 | متوسطة إلى منخفضة | وظائف POS/ERP كثيرة معلنة | اختلاف التقنية والتزامات GPL تحتاج مراجعة؛ لم يُختبر محليًا | لا يُنسخ |
| [supermarket-management-system](https://github.com/mxtxndx/supermarket-management-system) | لا يوجد ملف LICENSE في المسار المتوقع | قريبة جزئيًا | وظائف سوبر ماركت أساسية معلنة | README يذكر دعم تعدد المتاجر كعمل مستقبلي؛ لا يُعتمد كود بلا ترخيص واضح | مرفوض |
| [RetailFlow POS](https://github.com/Stylish87l/Multi-tenant-POS) | All rights reserved حسب README | قريبة تقنيًا | POS وتعدد متاجر معلنان | لا إذن واضح بإعادة الاستخدام | مرفوض |
| [ERPNext](https://github.com/frappe/erpnext) | GPL-3.0 | منخفضة بالنسبة للتقنيات المطلوبة | ERP ناضج واسع النطاق | تغيير جذري للتقنية وتكلفة تخصيص عالية؛ التزامات ترخيص وعلامة تجارية | بديل مستقل فقط |

## التوصية

إنشاء النظام من الصفر باستخدام TypeScript وExpress وPrisma وPostgreSQL، مع React/Vite وReact Native/Expo وفق المتطلبات. هذا يسمح بتصميم الاستحقاقات المدفوعة وعزل المستأجرين حول احتياجات المنتج بدل محاولة تعديل قاعدة غير مطابقة.

## حدود الفحص

تمت قراءة README وLICENSE وpackage.json المتاحة وبعض قوائم الملفات من GitHub. لم يتم استنساخ أو تشغيل المرشحين، ولم تُنفذ اختبارات أو مراجعة أمنية عملية. لا تعتبر الأوصاف المنشورة إثباتًا على جودة التنفيذ. راجع [GITHUB_REPOSITORY_EVALUATION_AR.md](GITHUB_REPOSITORY_EVALUATION_AR.md).
