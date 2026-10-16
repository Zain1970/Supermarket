# تقرير الاختبارات

**تاريخ التقرير:** 2026-10-16

## الاختبارات المضافة

| الفحص | الحالة | الملف |
|---|---|---|
| نقطة صحة API وأخطاء 404 | أُضيف ولم يُشغّل محليًا | `apps/api/src/app.test.ts` |
| رفض المستخدم غير المسجل ومنع الوصول لمتجر آخر | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/access-control.test.ts` |
| استحقاق الإضافات وحالات الانتهاء | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/addon-entitlement.test.ts` |
| استجابات middleware لعزل المتاجر | أُضيف ولم يُشغّل محليًا | `apps/api/src/security/store-access-middleware.test.ts` |
| مصادقة وجلسات حقيقية مع PostgreSQL | غير منفذة كاختبارات تكامل | تحتاج قاعدة بيانات اختبار |
| Prisma validate/generate | جارٍ التحقق عبر GitHub Actions | [سير CI](https://github.com/Zain1970/Supermarket/actions) |
| TypeScript build/typecheck والاختبارات | جارٍ التحقق عبر GitHub Actions | [سير CI](https://github.com/Zain1970/Supermarket/actions) |
| اختبارات عزل المستأجرين في PostgreSQL | غير منفذة | أولوية قبل الإنتاج |

## أوامر التحقق محليًا

```bash
npm install
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run typecheck
npm test
npm run build
```

لا تعتبر أي نتيجة ناجحة قبل تشغيل الأمر أو رؤية نتيجة CI ناجحة.
