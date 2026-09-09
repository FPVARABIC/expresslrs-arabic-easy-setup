# Upstream Policy

## مصادر الحقيقة

الترتيب المعتمد للحقائق التقنية:

1. Current ExpressLRS source عند SHA مثبت.
2. Official ExpressLRS documentation.
3. Official upstream releases/PRs/issues عند الحاجة.
4. Reproducible tests الخاصة بالمشروع.
5. Secondary sources فقط عند تعذر المصدر الأولي، مع وسم واضح.

## خطا الدراسة

- Stable product baseline: ExpressLRS `4.1.0` عند `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`.
- Development awareness reference: `master` عند `73ce820ba51437f73f31686233b607c58e188e7b` وقت الفحص.

الـStable baseline هو مرجع السلوك والبناء الأولي. فرع التطوير يُقرأ فقط لاكتشاف التغييرات القادمة، ولا يُخلط مع Stable results.

## قواعد الدمج المستقبلية

- لا vendoring أو submodule أو fork دائم قبل إغلاق ADR الاستراتيجية.
- كل build خاص بالمشروع يسجل upstream SHA وpatch-set version وtarget/options/toolchain/hash.
- كل Patch يملك hypothesis واختبارًا وقرار Keep/Modify/Reject.
- التحديثات RF-sensitive لا تُدمج آليًا.
- Patch يزول عندما يقدم upstream حلًا مكافئًا أو أفضل.

انظر [docs/upstream/baseline.md](docs/upstream/baseline.md) للسجل المثبت.
