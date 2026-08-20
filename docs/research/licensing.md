# Licensing and Trademark Boundary

Status: Phase 0 research, inspected 2026-08-20. This document is engineering guidance, not legal advice.

## Confirmed licenses

| Component | Pinned source | Evidence | Current reuse decision |
| --- | --- | --- | --- |
| ExpressLRS Firmware | `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6` | Root `LICENSE` contains GPLv3 | May be studied and reused only with GPL obligations preserved |
| ExpressLRS Configurator | `421d656f1987117e37472979444cee464e3fcdef` | Root `LICENSE`; package declares `GPL-3.0-or-later` | Concepts may be wrapped; copied/derived code creates GPL obligations |
| ExpressLRS Docs | `043f06727b2859dd5e67b725763645df5bccddee` | Root `LICENSE` contains GPLv3 | Quotations/derivations require attribution and license review |
| ExpressLRS Web Flasher | `4125a4e07d37ce1e872bb562ebd4286e6fd143f9` | No root license, package license, or SPDX declaration observed | **Do not copy, vendor, modify, or redistribute** pending explicit clarification |
| ExpressLRS Targets | `c4bd7b823594c233e673828ab493a2f8319a756a` | No root license or SPDX declaration observed | **Do not copy, vendor, modify, or redistribute** pending explicit clarification |

Primary evidence:

- [Firmware license](https://github.com/ExpressLRS/ExpressLRS/blob/a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6/LICENSE)
- [Configurator license](https://github.com/ExpressLRS/ExpressLRS-Configurator/blob/421d656f1987117e37472979444cee464e3fcdef/LICENSE)
- [Docs license](https://github.com/ExpressLRS/Docs/blob/043f06727b2859dd5e67b725763645df5bccddee/LICENSE)
- [Official license and trademark statement](https://github.com/ExpressLRS/Docs/blob/043f06727b2859dd5e67b725763645df5bccddee/docs/info/licenses.md)
- [Web Flasher tree at inspected SHA](https://github.com/ExpressLRS/web-flasher/tree/4125a4e07d37ce1e872bb562ebd4286e6fd143f9)
- [Targets tree at inspected SHA](https://github.com/ExpressLRS/Targets/tree/c4bd7b823594c233e673828ab493a2f8319a756a)

## Release obligations to design for

If the product conveys modified ExpressLRS firmware or covered binaries, the release process must:

- preserve copyright, attribution, license, and warranty notices;
- identify modified versions and dates;
- provide Complete Corresponding Source, including relevant build/control scripts;
- publish source access beside binary access and retain it for the required period;
- avoid downstream restrictions incompatible with GPL rights;
- retain file-specific third-party notices, including separately licensed FEC and vendored tooling;
- review Installation Information obligations before distributing firmware inside a consumer hardware product.

The conservative classification for Firmware is `GPL-3.0-only` unless a project-level “or later” grant is confirmed. The license text's own boilerplate is not by itself such a grant.

## Product-license recommendation

Lowest legal uncertainty: use `GPL-3.0-only` for a product that directly copies, links, or derives implementation from Firmware or Configurator. Until the future FPV Super-App license is known:

1. Keep modified firmware and its builder/flasher integration in an explicitly GPL-governed boundary.
2. Keep newly written Core and UI structurally separate while ADR review is open.
3. Communicate through documented structured contracts rather than React/UI coupling.
4. Do not assume that a process boundary automatically avoids copyleft; final distribution design needs legal review.

No product `LICENSE` file is selected during this Discovery checkpoint because Q-009 remains open.

The owner explicitly authorized one narrow public M2A Web preview on
2026-08-20. That preview may distribute only the independently written Web
shell, the admitted runtime dependencies, and their required notices. It may
not distribute Firmware, copied Configurator/Web Flasher/Targets material, or
claim final product-brand or Release approval. This exception does not resolve
Q-009 or select a license for the repository source.

## Trademark and naming

ExpressLRS names and logos are not granted under GPL. The product needs a distinct brand and must not imply official status. Recommended public wording:

> Compatible with ExpressLRS — independent community project, not affiliated with or endorsed by ExpressLRS LLC.

Do not use the official logo or a confusingly similar visual identity without permission. The current repository name is descriptive working text, not final product-brand approval.

## Release gate

No public binary or derived-source release until:

- Web Flasher and Targets reuse permissions are resolved or no material from them is distributed;
- the product-license ADR is accepted;
- the notice/source-bundle procedure is tested;
- dependency licenses are inventoried;
- trademark-safe product naming is approved.

The authorized M2A development preview above is evidence/evaluation material,
not the product Release governed by this gate.
