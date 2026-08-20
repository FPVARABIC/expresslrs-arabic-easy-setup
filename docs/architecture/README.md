# Architecture Scope During Discovery

المبدأ المبدئي الواجب اختباره:

`UI → Workflows → Core services → ExpressLRS adapter → Platform/device adapters → Official tools/protocols`

الـUI لا يقرر Target أو compatibility أو Binding strategy. Core يعيد structured states/results/errors/progress، ويظل مستقلًا عن React وDOM واللغة والمنصة.

هذه ليست بنية مجمدة. راجع [مقترح Milestone 1](milestone-1-proposal.md). المقترح لم يُنفذ لأن Phase 0 exit ما زال `HOLD`.
