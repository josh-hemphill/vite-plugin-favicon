# Vite plugin favicon Council record

## Rubric ballots

| Version | A | B | C | Decision |
| --- | --- | --- | --- | --- |
| v1 | Request changes | Request changes | Request changes | Revised coverage and pass anchors |
| v2 | Approve | Approve | Approve | Frozen, 3/3 |

A requested verification of the installable dependency and runtime, explicit legacy/format compatibility, and separate nested and relative build traces. B requested an existing-app collision scenario, clearer prerequisites and expected outputs, and a clean-consumer matrix aligned to declared support. C requested explicit profile outputs and an artifact trace from typed metadata through a reference to the published bytes. All amendments are incorporated below.

## Approved rubric v2

The artifact is `docs/vite-favicon-plan.md` in the Vite plugin workspace. It is a design and implementation plan for maintainers delivering automatic favicon and web/app icon generation to Vite developers. Review the frozen Markdown against the checked-out upstream plugin, its rework issue and linked reports, the released Favigen package and source, and the relevant Vite documentation or fixture evidence cited by the plan. Check the proposed config examples and trace one ordinary app, one path-based deployment under a subpath, a separate relative-base multi-page deployment with nested HTML, one companion/backend integration, and one 1.0.8 upgrade with an existing icon link, public icon, and existing manifest where applicable through the proposed behavior. Grade the plan, with future implementation checks recognized as such.

All categories require **≥9.2/10** at one decimal. Council of three independent `gpt-6.2-sol` reviewers at high effort. Full quorum per ballot and round, two votes for rubric approval or category pass, median for the category grade. Every category must pass on one frozen revision, plus all mandatory conditions. Record an evidence gap as UNVERIFIED if it prevents scoring.

| ID | Definition and required evidence | 8.0 anchor | 9.0 anchor | 9.2 pass anchor | 10.0 anchor |
| --- | --- | --- | --- | --- | --- |
| BASELINE | Current state, user intent, and feasibility with the actual released dependency. Compare source, issue history, and the installable artifact including its provenance, exports, Node floor and renderer/platform prerequisites. | Several assumptions remain unchecked. | Mostly accurate with a minor unresolved implication for the design. | Identifies the actual implementation baseline and issue gaps, verifies release identity and usable APIs, distinguishes evidence from decisions and future checks. | All consequential historical and dependency claims are checked, with clear implications and traceable evidence. |
| DX | Practical setup, useful defaults, customization, diagnostics, and upgrade path. Trace a clean config and existing 1.0.8 config. | Happy path works on paper but customization or upgrade feels ambiguous. | Defaults and migration are clear with a minor ambiguity in an ordinary workflow. | Installable examples name the Node/Vite prerequisites and source resolution. Profiles identify input formats, target assets, expected dev and build references, and pixel versus publication settings. Diagnostics and migration cover legacy config, modules, existing links and files. | Defaults and escape hatches fit all in-scope cohorts and all important edge states have actionable guidance. |
| VITE | Dev/build/preview, watch/cache, URL correctness, artifact lifecycle and failure recovery. Trace root, absolute nested-base, and relative-base nested-page build/preview separately. Check planned dev and watch edit, failure and recovery cases. | Ordinary build plausible but important lifecycle or URL cases unspecified. | Sound approach with a small lifecycle risk left unbounded. | Distinct dev/build mechanics, URL ownership, cache/invalidation and failures are coherent, with experiments and decisions for version-sensitive behavior. | End-to-end invariants and verification cover all promised modes, path forms and recovery cases precisely. |
| INTEGRATION | HTML, manifests and typed artifact handoff to companion plugins and backend consumers. Trace generated typed metadata through HTML and/or manifest into a published asset, verifying format, sizes/purpose and collisions at both markup and output paths. | Provides metadata but one critical handoff or conflict remains ambiguous. | Sound ownership with an unresolved edge case. | Single ownership, exact handoff timing and usable URLs are specified, with documented conflict behavior and test coverage. | Independent consumers can implement against the proposed contract, including failure and lifecycle semantics, without guessing. |
| DELIVERY | Ordered implementation, dependencies, acceptance tests, packaging, compatibility, release and migration verification. | Tasks named, but sequence or release evidence vague. | Actionable with a minor gap in release validation. | Clearly ordered slices with exit criteria and tests that would catch the reported regressions, clean packed-consumer gates for declared Node/Vite and module formats, CI and release/migration decisions. | Each material design risk has an ordered experiment or test and a clear release gate. |

Mandatory conditions. Deliver a design and implementation plan grounded in the actual project and the owner's release. Include the minimal developer path and explicit dev/build behavior, migration from 1.0.8, manifest ownership, and a credible clean installation/release path. This task is planning. Source implementation and release gates referenced in the plan are future work.

## Evidence checked during planning

- Upstream `latest` at `91fcc1d29e993fa904781cbc7be998bd483bce2f` differs from `v1.0.8` only in `README.md`. The review inspected the current entry point, config defaults, package metadata, placeholder test, issues #1, #3, #6, #7 and #26, and closed unmerged PR #2. [Upstream tree](https://github.com/josh-hemphill/vite-plugin-favicon/tree/91fcc1d29e993fa904781cbc7be998bd483bce2f) · [Rework tracker](https://github.com/josh-hemphill/vite-plugin-favicon/issues/7)
- The owner’s published `favigen-1.2.0.tgz` passed `sha256sum -c SHA256SUMS` with SHA-256 `e50ee9958680cb3b79ef11eb878bfc7f6c7b694a8b9bbccedbaa7451856f41f6`. A packed stand-in plugin declared a runtime dependency on that release URL. A clean npm install and subsequent `npm ci` resolved the URL transitively with a lockfile integrity entry, loaded the ESM and CJS entry points, and rendered eight PWA-profile assets from SVG on Linux x64, Node 26.7.0, and Sharp 0.35.5. The install emitted deprecations through Jimp and the legacy ICO path. [Release and checksum](https://github.com/josh-hemphill/favigen/releases/tag/v1.2.0)
- The scratch Vite 7.3.8/Rollup and Vite 8.3.8/Rolldown fixture ran `vite.build` with `write: false` and two HTML entries. Both emitted real icons from an ordered output hook and a companion could follow each manifest icon path to its output asset. The emitting hook could see newly emitted assets immediately on Vite 7. A later hook could see them on Vite 8 with a different bundle object.
- A separate two-version fixture confirmed Vite’s copied public ICO is absent from the output hook’s bundle; explicit emission at the same path overwrote it on disk. A later hook's direct asset mutation was visible to a final validator on both versions. Re-emitting an existing exact name triggered a Rollup `FILE_NAME_CONFLICT` log and kept the original bytes. Rolldown exposed the replaced bytes. A Rollup `onLog` handler promoted the targeted conflict to an error.
- The probes exercise package identity, output timing and two classes of collision. The implementation gates cover the full adapter, including dev serving, watch, preview, browser behavior and the release matrix.
- The producer, normal-order companion, and internal `enforce: 'post'` validator executed in that order on both Vite majors with `write: false`. The companion saw the icon and the validator saw the companion’s manifest. Member B independently verified that a late hook error occurred after Vite had cleared a seeded prior output on both majors.

## Council membership

All members used `gpt-6.2-sol` at high reasoning effort in each round.

| Member | Neutral framing |
| --- | --- |
| A | Read the plan from the perspective of a maintainer adopting a dependency and shipping an upgrade. |
| B | Read the plan from the perspective of a developer trying it on an existing Vite app. |
| C | Read the plan from the perspective of a downstream plugin author consuming generated assets. |

## Round 1

Approved rubric v2. Plan SHA-256 `c92b26e9702ed105bacff665d238dfaecf134127094bd9937a6b3e6b065b53e0`. All members verified that the mandatory planning deliverables were present. Vite and integration fell below the target.

| Category | A | B | C | Range | Median | Pass votes | Status |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| BASELINE | 9.6 | 9.5 | 9.5 | 9.5–9.6 | 9.5 | 3/3 | Pass |
| DX | 9.2 | 9.2 | 9.0 | 9.0–9.2 | 9.2 | 2/3 | Pass |
| VITE | 9.0 | 9.0 | 9.0 | 9.0 | 9.0 | 0/3 | Fail |
| INTEGRATION | 9.0 | 9.1 | 8.9 | 8.9–9.1 | 9.0 | 0/3 | Fail |
| DELIVERY | 9.2 | 9.3 | 9.4 | 9.2–9.4 | 9.3 | 3/3 | Pass |

- **A.** Checked upstream, published package identity and Vite runtime evidence. Requested precise output hook order, common lazy readiness for direct stable requests, a root ICO allowlist rule, separate CDN development and production URLs, a portable bundle type, a valid migration for old vendor presets, and explicit Node and package manager coverage.
- **B.** Verified source, package exports, clean install and the differing Vite bundle views. Reproduced Vite clearing an old file before a late failure. Requested the output check’s guarantee and ordering boundary, content-based API validation, live public route ownership, better starter guidance, and acceptance cases for early/late failure and route conflicts.
- **C.** Verified dependency provenance and traced a real regular 192 px app icon through the nested manifest reference to its bytes. Requested a concrete development URL and target ID list, explicit terminal hook ordering with `write: false`, a cross-bundler companion API type with accurate `mimeType`, and a portable check of the current output instead of a promise to detect indistinguishable stale outputs. Asked to stage the ordering experiment before the API is finalized.

The revised plan adds a phased producer, companion and validator contract, separate public directory checks, and a deployment boundary for late build failures. It explicitly handles stable route readiness, public-file add/unlink, and a local dev manifest under a CDN base. The typed consumer uses an output reader instead of exposing a bundler-specific type or bundle identity. The revision also documents target IDs, pathname examples, the legacy option migration, and dual-major validation of the companion example. The below-target DX vote was addressed with those specific additions.

## Round 2

Approved rubric v2. Plan SHA-256 `19867a441b60573ed8913926a4ac09bbd8dfa8e00ef8b34ddd5cc5d2143e3eb2`. All mandatory planning conditions were present. Integration remained below the target.

| Category | A | B | C | Range | Median | Pass votes | Status |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| BASELINE | 9.8 | 9.6 | 9.6 | 9.6–9.8 | 9.6 | 3/3 | Pass |
| DX | 9.5 | 9.6 | 9.5 | 9.5–9.6 | 9.5 | 3/3 | Pass |
| VITE | 9.4 | 9.4 | 9.1 | 9.1–9.4 | 9.4 | 2/3 | Pass |
| INTEGRATION | 9.1 | 9.2 | 9.1 | 9.1–9.2 | 9.1 | 1/3 | Fail |
| DELIVERY | 9.4 | 9.5 | 9.5 | 9.4–9.5 | 9.5 | 3/3 | Pass |

- **A.** Independently confirmed the new hook order, copied public files, and Rollup warning behavior. Requested a tested parser for the warning and pointed out that a dev launch retaining the production `/shop/` path returns 404 when Vite mounts at `/brand/`.
- **B.** Verified the hook order and both bundlers’ duplicate behavior, and passed the nested companion flow. Requested explicit proxy or absolute URL guidance for split-origin backend development, warning propagation to user hooks, and a direct link to the closed PR.
- **C.** Reproduced the same mount failure with a live Vite server on both versions and found that an unmapped scope also excludes the app. This drove the below-target Vite vote. Requested tests for production app and CDN mounts that differ, including explicit launch and scope overrides.

The revision resolves production manifest URLs before mapping paths under the app mount onto Vite’s local dev mount. It verifies origin and directory containment, preserves the launch query and fragment, validates scope, and specifies a diagnostic for out-of-mount values. A live scratch fixture using the published Favigen helper confirmed the mapped launch returns 200 and the unmapped path returns 404 on Vite 7.3.8 and 8.3.8. The checked-in plan calls for a complete integration fixture. The revision also documents the separate-origin backend proxy, the Rollup log handling check, and the direct PR reference. The companion example compiled in strict TypeScript against both tested Vite versions and the actual published Favigen declaration.

## Round 3

Approved rubric v2. Plan SHA-256 `654d52ecb32a59ea85c94f88ab4da716576f1229baa3838729b11844315b8f81`. Each member verified that all mandatory planning conditions were met.

| Category | Target | A | B | C | Range | Median | Pass votes | Status |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| BASELINE | ≥9.2 | 9.8 | 9.7 | 9.6 | 9.6–9.8 | 9.7 | 3/3 | Pass |
| DX | ≥9.2 | 9.5 | 9.6 | 9.5 | 9.5–9.6 | 9.5 | 3/3 | Pass |
| VITE | ≥9.2 | 9.5 | 9.6 | 9.4 | 9.4–9.6 | 9.5 | 3/3 | Pass |
| INTEGRATION | ≥9.2 | 9.6 | 9.5 | 9.5 | 9.5–9.6 | 9.5 | 3/3 | Pass |
| DELIVERY | ≥9.2 | 9.6 | 9.6 | 9.6 | 9.6 | 9.6 | 3/3 | Pass |

- **A.** Rechecked the release checksum, source/migration paths, Vite output order and both companion typechecks. Verified the mounted dev launch and nested publication trace. The separate-origin proxy fixture should exercise launch and scope on the backend origin as well as fetching generated assets, or use a backend-owned manifest if those mounts differ.
- **B.** Rechecked upstream provenance, shipped declarations and prerequisites, the existing-app and named-output flows, output and cache behavior, and the typed handoff on both majors. Verified mapped launch and scope, query/fragment preservation, and rejected sibling/origin cases. Specify how missing trailing slashes in `manifest.appBase` are normalized during implementation and keep manifest launch metadata in the manifest JSON.
- **C.** Rechecked the source, registry and owner artifact, real 192 px path/digest trace, output ordering and collisions across both bundlers, mapped dev launch, and strict TypeScript checks. Keep warning-message handling and user logging propagation in the collision fixture.

The plan passed in one complete round. Package provenance, representative Vite behavior, and public API type feasibility were verified in scratch consumers. Full plugin behavior, browser and backend proxy flows, watcher recovery, package manager support and the broader OS matrix remain as acceptance tests for implementation.
