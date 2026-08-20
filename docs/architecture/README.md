# Architecture Foundation

اتجاه المعمارية المنفذ في Milestone 1:

`UI → Workflows → Core services → ExpressLRS adapter → Platform/device adapters → Official tools/protocols`

الـUI لا يقرر Target أو compatibility أو Binding strategy. Core يعيد structured states/results/errors/progress، ويظل مستقلًا عن React وDOM واللغة والمنصة.

Phase 0 خرجت إلى Foundation/Mock فقط، مع بقاء Hardware/write/release gates مؤجلة. المجلد يوثق:

- [مقترح Milestone 1 وبوابة القبول الأصلية](milestone-1-proposal.md).
- [حدود Core API التجريبية](core-api.md).
- [مسارات Binding/Update التجريبية وحالات الفشل](mock-workflows.md).
- [أدلة قبول Milestone 1 الحالية](../testing/milestone-1-acceptance.md).

البنية ليست API مستقرة بعد. لا يوجد Provider حقيقي للمتصفح أو Android أو Firmware write.
