# تقرير الاختبارات

**تاريخ التقرير:** 2026-10-16

## الاختبارات المضافة

| الفحص | الحالة | الملف |
|---|---|---|
| نقطة صحة API | أُضيف ولم يُشغّل محليًا | `apps/api/src/app.test.ts` |
| أخطاء المسارات غير الموجودة | أُضيف ولم يُشغّل محليًا | `apps/api/src/app.test.ts` |
| رفض المستخدم غير المسجل | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/access-control.test.ts` |
| منع الوصول لمتجر آخر | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/access-control.test.ts` |
| تقييد الأدوار | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/access-control.test.ts` |
| استحقاق POS/الإضافات وحالات الانتهاء | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/addon-entitlement.test.ts` |
| TypeScript build/typecheck | لم يُشغّل | يتطلب تثبيت الاعتماديات |
| Prisma validate/generate/migrate | لم يُشغّل | يتطلب تثبيت الاعتماديات وإعداد قاعدة البيانات للترحيل |
| اختبارات تكامل عزل المستأجرين في PostgreSQL | غير منفذة | أولوية قبل الإنتاج |

## أوامر التحقق المقترحة

```bash
npm install
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run typecheck
npm test
npm run build
```

لا تعتبر أي نتيجة ناجحة قبل تشغيل الأمر أو رؤية نتيجة CI ناجحة.
