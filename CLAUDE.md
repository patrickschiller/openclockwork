# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

The repo is currently spec-only — `base-instructions.md` is the authoritative requirements document (German) for an **Integrated Digital Time and Attendance Management System** ("Zeiterfassung"). No source code, build files, or CI exists yet. When implementing, treat `base-instructions.md` as the source of truth and re-read the relevant epic before generating code.

## Tech stack (binding decisions from the spec)

- **Backend:** C# on Azure App Services. **Every method must be `async`** — this is a hard rule from the spec, not a guideline.
- **Database:** Azure SQL. Connection strings live in Azure Key Vault, never in code.
- **Frontend (admin):** React for the browser-based supervisor/admin UI.
- **Frontend (mobile):** Same React codebase shipped as a PWA (service worker + manifest). Architecture must keep a future React Native migration open — avoid browser-only APIs in shared business logic.
- **UI system:** Material Design 3 patterns across the entire frontend.
- **Architecture:** Strict API-first separation. The frontend never reaches into backend internals; it only consumes the REST API.
- **CI/CD:** GitHub Actions → Azure App Services on push to `main`.

## Domain rules that the implementation must encode

These are easy to get wrong by guessing — pull them from the spec rather than inventing defaults:

- **Time models:** Teilzeit, Vollzeit, Vertrauensarbeitszeit, Gleitzeit. Each employee is assigned exactly one, which drives Soll-Stunden calculations.
- **Automatic break deduction (statutory):** 30 min after 6 h worked; an additional 15 min (45 min total) after 9 h. APIs must return both Brutto- and Nettoarbeitszeit.
- **Accounts:** maintain an Überstundenkonto (Ist − Soll) and an Urlaubskonto; expose current balances via async endpoints.
- **Approval-required bookings:** any booking or Zeitantrag **before 07:00 or after 23:00** must trigger the "genehmigungspflichtig" workflow. The frontend must also warn visually before submission.
- **Application types:** Urlaub, Home-Office, Sonderurlaub, Zeitantrag — all routed through the workflow engine.
- **Kernzeitverletzungen:** detected server-side and surfaced as flags/info via API; shown in the dashboard.
- **ERP integration:** a separate async endpoint exposes booked + approved times for the external ERP system. Keep this surface distinct from the internal app API.
- **Mobile capture:** PWA "Kommen"/"Gehen" buttons send GPS coordinates when device permission allows; absence of GPS must not block the booking.
- **Calendar visualization:** annual calendar with color-coded states for Krankheit, Urlaub, Home-Office, Schulung, Sonderurlaub, Gleittage.

## When scaffolding the project

Because nothing exists yet, the first implementation steps should follow the spec's epics in order: Epic 1 (Azure + CI/CD + PWA shell) before Epic 2 (backend domain) before Epic 3 (frontend UX). Don't introduce frameworks, ORMs, or libraries the spec doesn't call for without flagging the choice — the spec is opinionated and deviations should be deliberate.
