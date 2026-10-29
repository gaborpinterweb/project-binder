# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Minor lines use a tree codename from `package.json` `releaseName` (shown in section headings).

## [Unreleased]

## [1.0.0] - 2026-10-29 (Pine)

### Added

- First public release of Project Binder on PocketBase (auth, per-user workspace, attachments).
- Community and Commercial builds; Commercial Free/Pro via Polar checkout, webhooks, and `/confirm-pro`.
- Workspace modules: boards (including Master board), notes, files, databases, tasks, timelogs/timers, trash, and archive.
- Export/import, public read-only sharing, Settings (including Billing deep links), onboarding, and web manifest.
- Commercial paywall for active-project, storage, and public-share limits.
- Gated Fly releases (`version.json`, `npm run release`) and Playwright e2e coverage for auth, projects, tasks, timelogs, sharing, and billing.
