# FilterFilterDM — Project Guide

**Document version:** 0.12.0  
**Project stage:** Local prototype, Milestone 1 in progress  
**Development workflow:** MetaModules Development State Machine Workflow v1.4.0 (lightweight adaptation)  
**Current code:** 0.7.0 user-approved working baseline; runtime verification remains unverified

## Start here

This file is the project's working source of truth: product intent, scope, important decisions, current implementation, verification evidence, and next steps live together here. Read it before changing the app. Keep it concise and update it when evidence or user decisions change the project. Source files are separated by browser responsibility, but this guide is the only project-context document for now.

The original design input was the user's pasted **Social Inbox Assistant — Prototype Brief**, version 0.1.0. That brief remains in the chat attachment; its core intent is summarized below so work can continue without relying on chat history.

## Product intent

Build a local-first assistant that helps one person manage the attention demanded by incoming social comments and direct messages. It organizes, summarizes, and recommends. The user decides what matters and communicates themselves.

- **Comments:** audience awareness—interesting discussion, questions, suggestions, recurring topics, and useful feedback.
- **Direct messages:** personal communication—conversations that may deserve a reply, follow-up, or review, considering their history.
- Share classification concepts, but keep attention policies distinct between public comments and private conversations.
- Make recommendations explainable. Preserve access to original content and show uncertainty.
- Never send replies, delete, or hide messages automatically.

## Current scope

Milestone 1 is a usable interface with realistic local sample data: dashboard overview, separate Comments and Direct Messages views, briefing, search and filters, message/conversation inspection, basic read/save/review actions, editable future-classification guidance, locally saved replies, noise/spam sorting, local sender blocking, and local report notes. This prototype has no platform account connections and makes no network requests; replies, blocks, and reports are not sent to a platform.

Later milestones—model-backed classification, user preference rules, richer conversation grouping, public dataset import, and platform adapters—are deferred. Do not implement them as part of Milestone 1. Any future platform or model integration needs its own design and policy review. No automatic messaging is in scope.

## Roadmap: evaluate first, integrate, then add AI/ML

**Working recommendation:** define the evaluation data and scoring method first; use YouTube as the first live comment source; investigate TikTok access before committing to its connector; compare AI/ML only after there is a human-labeled baseline. This sequence avoids choosing a model before we can measure it and checks TikTok's access constraints early.

Platform APIs, evaluation datasets, and AI/ML are separate parts of the project. Connecting an API does not provide evaluation labels, and a model does not establish what the user considers useful. Each phase below has its own exit check. This roadmap is for planning; it does not authorize account connections, third-party data transfer, or platform actions.

### Phase 0 — Confirm access and evaluation contract

**Status:** Initial official-document scan and draft evaluation contract completed 2026-11-01. User confirmed United States account region and fictional examples plus license-checked public examples as the first evaluation sources. Phase 0 remains open only for agreeing the label guide and false-positive trade-offs.

- **Confirmed:** first target account region is the United States. TikTok's Data Portability route described in its current documentation is limited to EEA/UK users, so it is not a current route for this account. Recheck official requirements before implementation; Research API eligibility and application approval remain unresolved.
- Define the evaluation labels in user language: message type, tone, attention/response recommendation, and noise/spam. Decide what counts as a harmful false positive for each label.
- Decide how consented real examples or public data may be stored and processed. Check provenance, license, privacy, field coverage, and representativeness before using a dataset.
- **Proposed evaluation record:** `platform`, `kind` (comment or DM), message text, minimal relevant context (post/video context for comments; prior turns for DMs), one primary `messageType`, one primary `tone`, one `priority`, separate `triage` (`normal`, `noise`, or `spam`), and a short label note/uncertainty. Keep author names, handles, IDs, and contact details out of evaluation examples; use random local IDs. Store source/provenance separately from the text and labels.
- **Proposed label guide v1:** `messageType` describes what the message is doing (for example, question, feedback, encouragement, follow-up, collaboration); `tone` describes how it comes across (for example, curious, friendly, critical, reflective, positive, neutral); `priority` describes the suggested attention/action using the project's existing user-facing vocabulary (comments: `Worth a look`, `Reply maybe`, `Nice to know`; DMs: `Needs a reply`, `Review when free`, or no response needed). `triage` is separate: `normal`, `noise`, or `spam`. Preserve the product's different comment and DM logic. These are proposed evaluation labels, not a frozen taxonomy; record edge cases and allow `uncertain` rather than forcing a guess.
- **Keep these fields separate:** `reviewed`, `read/unread`, `saved`, `customTags`, and report/block/reply actions describe user workflow or personal organization; they are not ground-truth classifier labels by default.
- **Proposed scoring:** report precision and recall per label, split by comment/DM and platform where the set is large enough. For Noise/Spam, track legitimate messages incorrectly flagged as false positives. Keep a held-out set that is not used to tune rules or models. Ambiguous examples can be marked uncertain and left out of the primary score.
- **Proposed error cost:** a legitimate message marked Noise/Spam is the most costly false positive because it is removed from the regular inbox; measure this separately and require review before treating any filter as reliable. A false `Worth a look`/`Needs a reply` suggestion consumes attention, so report precision as well as missed useful messages. Do not set numeric acceptance thresholds until the first labeled examples make the trade-off concrete.
- **Confirmed first data mix:** fictional examples plus public examples only after license, privacy, scope, and fit review. Do not upload message text to Hugging Face or another service as part of this step.
- **Safety boundary:** model outputs remain suggestions for user review. No automatic replies, platform reports, blocks, deletions, or hiding.
- **Exit:** a concise field/label schema, privacy and data-source rules, platform access matrix, and measurable evaluation criteria exist; the user has confirmed any account-region and personal-data choices that affect access.

**Initial findings to recheck before implementation:** YouTube's Data API documents comment threads and replies and requires application authorization/OAuth for authorized operations. TikTok's standard Display API documents profile and video metadata, not comments. TikTok's Research API includes comment data but requires eligibility and application approval. TikTok's Data Portability API documents comments and direct messages in exported account data, but currently says it serves TikTok users in the EEA and UK; this does not cover the user's U.S. account. These facts make YouTube the better first live-source candidate and leave TikTok's path unresolved. See [YouTube comment threads](https://developers.google.com/youtube/data/reference/rest/v3/commentThreads), [YouTube API authorization and quota](https://developers.google.com/youtube/data/getting-started), [TikTok Display API](https://developers.tiktok.com/docs/en/display-api-overview), [TikTok Research Tools](https://developers.tiktok.com/products/research-api/), [TikTok Data Portability API availability](https://developers.tiktok.com/products/data-portability-api/), and [TikTok exported data types](https://developers.tiktok.com/docs/en/data-portability-data-types).

**Public-data candidate screened:** UCI's [YouTube Spam Collection](https://archive.ics.uci.edu/dataset/380/youtube%2Bspam%2Bcollection) is licensed CC BY 4.0 and contains 1,956 comments from five videos with binary spam/legitimate labels. It is a good narrow candidate for checking the Noise/Spam portion of the evaluation only; it cannot measure DMs, tone, message type, or reply-worthiness, and its dated, video-specific sample should not be treated as representative of current inbox traffic. The source includes author, comment, and date fields; any local use should discard author, comment ID, date, and video identifiers, inspect message text for personal information, and retain only suitable text, the binary source label, and required attribution/provenance. This is a candidate review, not an import or a claim that it is a complete benchmark.

### Phase 1 — Create a labeled evaluation set and baseline

**Status:** Fictional seed v1 drafted in `evaluation/seed-v1.jsonl` (12 comments, 12 DMs); labels are unreviewed examples, not ground truth or a scored baseline. **Depends on:** user review of the Phase 0 label guide and data rules.

- Start with fictional examples and public examples only after license/privacy/fit review. UCI's YouTube Spam Collection is a candidate for a narrow spam slice; Hugging Face remains a discovery option, not a chosen dependency. The user has not authorized a live account connection or any upload of message data.
- Keep human labels separate from model-generated suggestions. Hold back examples that are not used to tune the first rules or model so comparisons remain meaningful.
- Score each label separately, including precision/recall and false positives for Noise/Spam and attention recommendations. The user decides the acceptable trade-off between missing useful messages and surfacing too many.
- The current prototype displays static sample classifications; it does not yet run an automated classifier. Record that as the starting state rather than claiming the current UI is an AI or rules baseline.
- **Exit:** a versioned test set, documented label guide, and repeatable baseline report exist. Dataset cards should be inspected for license, scope, and bias; see [Hugging Face Dataset Cards](https://huggingface.co/docs/hub/main/datasets-cards).

### Phase 2 — Build a read-only YouTube comments pilot

**Status:** Not started. **Depends on:** Phases 0 and 1, plus a separate user-approved account authorization.

- Begin with reading the user's own video comments and available thread/reply context. Map API records into the app's existing message fields and retain platform/video identifiers and source provenance.
- Make OAuth scopes, quota behavior, refresh/reconnect, duplicate updates, and local data retention explicit before implementation.
- Keep posting replies, deleting comments, blocking, and reporting out of this first connector. Do not copy message data to any hosted model or dataset service without separate user approval.
- **Exit:** an authorized test account can import and refresh its comments into a reviewable local inbox, with duplicate handling and an explicit disconnect/data-clear path.

### Phase 3 — Resolve the TikTok access path

**Status:** Access feasibility unresolved. **Can proceed in parallel with:** Phase 2's read-only pilot.

- Check whether the user's account region and use case qualify for an official comments/DM route, and whether required app review can be completed.
- If an approved route exists, write a small read-only feasibility prototype and document which comment/DM fields are actually available. If it does not, compare a user-provided account export/import path or defer TikTok; do not scrape or bypass platform access restrictions.
- **Exit:** choose one supported path with known scopes, regions, limitations, and consent flow, or explicitly defer the integration.

### Phase 4 — Compare AI/ML suggestions against the baseline

**Status:** Not started. **Depends on:** Phase 1; use Phase 2/3 data only if access and consent allow it.

- First compare existing hand-authored rules and suitable pretrained models against the same held-out labeled examples. Training a custom model is a later option, not the default starting point.
- Measure quality by label and platform, inspect false positives/negatives with the user, and preserve explanations/confidence where available.
- Choose local versus hosted inference only after comparing quality, privacy, cost, and maintenance needs. Keep all replies, blocks, and reports under user control.
- **Exit:** evidence shows whether a model improves on the baseline and for which labels; the user approves the next scope before any production-facing model or account action.

## Workflow and recovery

Use a small, evidence-based loop: clarify expected behavior, keep a recoverable prior state, make one scoped candidate, inspect it, run the checks relevant to the change, repair and rerun failures, then record actual results. Keep user approval of product behavior separate from technical verification; do not call an implementation technically accepted without runtime evidence. Because this folder began empty and has no Git history, the initial candidate is the first recoverable source state. Preserve it before any major redesign.

The brief mentioned workflow v1.5.0, but the current MetaModules repository contains Development State Machine Workflow v1.4.0 and no v1.5.0 file. This project adopts v1.4.0, adapted to keep project context and workflow notes in this one file rather than adding separate planning/maintenance documents. The reusable workflow itself is not copied here; its source is `C:\Users\jo\Desktop\Active\MetaModules\workflows\Development-State-Machine-Workflow-v1.4.0.md`.

## Initial implementation

- `index.html`: app structure and accessible landmarks.
- `styles.css`: responsive visual design.
- `sample-data.js`: fictional sample comments and conversations; keep data separate from UI logic.
- `app.js`: rendering, search/filtering, selection, and local user state.
- Message metadata is structured as separate `messageType`, `tone`, `priority`, `confidence`, `reason`, `classificationSource`, and `customTags` fields. Message-type/tone edits are user corrections; personal tags are separate.
- No framework, build step, backend, dependencies, analytics, or external service.
- Open `index.html` in a browser to run. User state is stored in browser `localStorage` for that file origin; sample records remain in `sample-data.js`.

Keep mock data and future model predictions visibly distinct. Do not imply that sample records are real imported messages or that any AI classification ran.

## Acceptance checks for Milestone 1

1. App opens locally without a build step or network connection.
2. Dashboard totals and briefing agree with the sample records and their states.
3. Dashboard recommendation counts match the Comments “Worth a look” and DM “Needs a reply” filters.
4. Comments and DMs have separate views and their own meaningful filters.
5. Source-app, message-type, tone, and personal-tag filters work with newest/oldest sorting in each active view.
6. Message type and tone can be edited per message; personal tags remain a separate editable field.
7. Personal tags can be added to and removed from messages, appear in the list, and persist locally.
8. Search narrows the active view; empty results are explained.
9. Selecting an item shows its original text and relevant context.
10. Read/unread, saved, and reviewed markers are independent; review state appears on the message and in a Reviewed filter and persists after reload.
11. Layout remains usable at desktop and narrow viewport widths; controls have labels and keyboard focus is visible.
12. No platform send, delete, block, hide, report, external account, or network behavior exists; reply text and moderation actions remain local to this browser.
13. The category manager lists message types, tones, and attention labels, supports adding, editing, and removing future guidance, and leaves existing sample classifications unchanged.
14. A reply can be saved to the selected local comment or DM conversation and is still visible after rerendering or reload.
15. Messages marked Noise or Spam leave the regular inbox and remain accessible through a Noise / spam filter; they can be returned to the inbox.
16. Blocking a sender locally removes their messages from regular inbox views across comments and DMs; a Blocked filter provides access to unblock them.
17. A local report note records a reason and optional note on a message; the UI clearly states that no platform report is sent.

## Decisions and open questions

- **Decided:** local-only mock-data prototype; no live integrations in Milestone 1.
- **Decided:** comments and DMs are separate product areas with different priority logic.
- **Decided:** use a plain browser app to keep the initial experiment easy to run and revise.
- **Decided:** retain the dashboard's collected-comment and DM totals; add source-app filtering and newest/oldest sorting inside inboxes. Keep current briefing/topic panels until real user activity makes their value clearer.
- **Decided:** users can add personal tags to individual messages, remove them later, and filter the inbox by those tags.
- **Decided:** keep `messageType`, `tone`, and `customTags` as three separate metadata fields. Message type and tone are user-editable sample classifications; corrections are stored locally. No model training is implemented yet.
- **Decided:** keep a separate editable catalog of message types, tones, and attention labels with short “when to use it” notes. These notes are future classification guidance only; this prototype has no AI and catalog edits do not rewrite existing sample labels. Removing a catalog entry leaves historical message values visible.
- **Decided:** replies can be drafted and saved to local sample conversations for review; no reply is transmitted because no platform is connected.
- **Decided:** messages can be classified as Noise or Spam and moved out of the regular inbox without deleting them; a dedicated filter keeps them browseable and reversible.
- **Decided:** sender blocking is local to the prototype and hides their messages from regular comments and DM views while keeping them in a Blocked filter for unblocking. It does not block the sender on a social platform.
- **Decided:** reports are local notes with a reason and optional details. The prototype does not transmit reports to a social platform.
- **Decided:** review is an independent marker, separate from read/unread and saved state. A Reviewed badge appears in the message list, and each inbox has a Reviewed filter.
- **Decided:** YouTube and TikTok are the first platform integrations to investigate.
- **Recommended sequence:** evaluation data and measures first; YouTube read-only pilot as the first live source; TikTok access decision in parallel; AI/ML comparison after the baseline.
- **Open:** final evaluation labels and acceptable false-positive/false-negative trade-offs; complete Phase 0 before implementation.
- **Open:** TikTok's approved comments/DM access path for the user's U.S. account; EEA/UK Data Portability eligibility does not apply. See Phase 3.
- **Open:** suitable dataset and model/hosting choice; see Phases 1 and 4.

## Current status (2026-11-01)

- **Designed:** product intent and Milestone 1 scope above.
- **Implemented:** local interface 0.7.0. It includes all features recorded for 0.6.0, plus an independent review marker displayed beside message metadata and a Reviewed filter in both inboxes. Legacy `status: "reviewed"` sample and saved records are migrated to `reviewed: true` and `status: "read"`.
- **Verification:** source review only; runtime tests were not run for 0.7.0. Browser interaction remains **BLOCKED / NOT RUN** because the browser tool rejected `file://` navigation and explicitly prohibited using an alternate route to achieve the same result. Do not describe this version as runtime-tested.
- **Accepted so far:** user approved 0.7.0 as the working baseline (“good so far”). This records product approval, not independent runtime verification; the app remains unverified in this environment.
- **Known limits:** sample content is fictional; there is no real AI classification, platform data, server, sync, or backup. User corrections and category guidance are saved locally but no AI currently consumes them for future suggestions. Local replies, blocks, and reports are not sent to social accounts.
- **Next:** review the proposed label guide and the fictional seed at `evaluation/seed-v1.jsonl`; revise labels or examples that do not match the intended filter. Then create a privacy-minimized UCI spam subset if its text-level review remains suitable, and reserve held-out examples before scoring any rules or models. Verify the current UI baseline in the user's browser when available.
