# سياسة تقييم مشاريع GitHub

**تاريخ التقييم:** 2026-10-16  
**المستودع المستهدف:** https://github.com/Zain1970/Supermarket

## النتيجة الأولية

لم يُعثر على أساس جاهز يجمع متطلبات المنتج كلها مع ترخيص واضح وتوافق كامل مع التقنيات المستهدفة. التوصية الحالية: **بناء نواة المشروع من الصفر**، مع الاستفادة من الأفكار المعمارية العامة فقط، وعدم نسخ كود أي مرشح قبل مراجعة أعمق.

## المرشحون

| المشروع | الترخيص المرصود | التقنيات المعلنة | الوظائف المعلنة | الفجوات/المخاطر | القرار |
|---|---|---|---|---|---|
| [multi-tenant-pos-saas](https://github.com/ZineddineBk09/multi-tenant-pos-saas) | MIT، ملف LICENSE موجود | Next.js، Fastify، PostgreSQL RLS، Drizzle، pnpm/Turborepo | POS، مخزون، فصل المستأجرين، توثيق معماري وCI | ليس Express/Prisma؛ يركز على POS/المخزون؛ لا يغطي التطبيقات الخمسة والاشتراكات والإضافات كما تتطلبها المواصفات؛ لم تُشغّل اختباراته هنا | مرجع معماري محتمل، لا يُعتمد كقاعدة الآن |
| [retail-smart-erp](https://github.com/ravindu2012/retail-smart-erp) | GPL-3.0، ملف LICENSE موجود | Next.js، React، PostgreSQL، Drizzle | POS، تعدد المستأجرين، مخزون، وظائف ERP متنوعة | إطار وتقنيات مختلفة؛ GPL-3.0 يتطلب مراجعة التزامات التوزيع والتعديلات قبل اعتماد الكود تجاريًا؛ لم يُجرَ فحص أمني أو تشغيل للاختبارات | لا يُنسخ إلى المشروع حاليًا |
| [supermarket-management-system](https://github.com/mxtxndx/supermarket-management-system) | لا يوجد ملف LICENSE في المسار المتوقع؛ README وpackage.json يذكران MIT فقط | React، Supabase، Node/Express | POS ومخزون ومشتريات وعملاء وتقارير | غياب ملف ترخيص صريح يمنع اعتماد الكود وفق سياسة المشروع؛ يذكر README أن دعم تعدد المتاجر من التحسينات المستقبلية؛ نموذج بيانات/تخزين يحتاج مراجعة | مرفوض كقاعدة كود |
| [Multi-tenant-POS / RetailFlow](https://github.com/Stylish87l/Multi-tenant-POS) | README يعرض “All rights reserved” | React، Express، PostgreSQL، Drizzle | POS ومخزون وأدوار وفروع | الترخيص لا يسمح بإعادة الاستخدام دون إذن؛ ادعاءات README ليست إثباتًا لاختبار مستقل | مرفوض كقاعدة كود |
| [ERPNext](https://github.com/frappe/erpnext) | GPL-3.0 | Frappe/Python، MariaDB، تطبيق ERP متكامل | مخزون، مشتريات، محاسبة، POS وغيرها | منتج كبير بتقنيات مختلفة جذريًا؛ تكلفة تخصيص وتعلم أعلى؛ يلزم تقييم قانوني للتوزيع والعلامة التجارية | بديل منتج مستقل للمقارنة، وليس قاعدة هذه البنية |

## مصادر الفحص

- https://github.com/ZineddineBk09/multi-tenant-pos-saas
- https://github.com/ZineddineBk09/multi-tenant-pos-saas/blob/main/LICENSE
- https://github.com/ravindu2012/retail-smart-erp
- https://github.com/ravindu2012/retail-smart-erp/blob/main/LICENSE
- https://github.com/mxtxndx/supermarket-management-system
- https://github.com/Stylish87l/Multi-tenant-POS
- https://github.com/frappe/erpnext
- https://erpnext.com/license-trademark

## ما تم فحصه فعليًا

- تم التأكد أن مستودع المشروع المستهدف فارغ حاليًا عبر GitHub Contents API.
- تمت قراءة ملفات README وLICENSE وpackage.json المتاحة لبعض المرشحين.
- تم التحقق من وجود ملف LICENSE أو غيابه في المسارات المذكورة أعلاه.
- **لم يتم** استنساخ المستودعات أو تشغيلها، ولم يتم تشغيل اختبارات المرشحين أو فحص اعتمادياتهم وثغراتهم. لذلك لا تُعد النتائج تدقيقًا أمنيًا أو إثباتًا لصحة التنفيذ.

## التوصية والقرار

ابدأ من الصفر ضمن Modular Monolith باستخدام TypeScript وNode.js وExpress وPrisma وPostgreSQL، مع تطبيق React/Vite للويب وتطبيقات React Native/Expo للموبايل في مراحل منفصلة. صمم صلاحيات المستأجر والإضافات المدفوعة منذ البداية. استخدم المرشح MIT أعلاه كمصدر أفكار وتعلم معماري فقط، ولا تنسخ منه كودًا في هذه المرحلة.

هذا تقييم تقني أولي وليس استشارة قانونية. عند إدخال أي اعتماد أو أصل خارجي لاحقًا، سجّل ترخيصه وإصداره وإشعاراته المطلوبة.
