# Repository Guidelines

## Project Structure & Module Organization
- Entry points: `index.html` and `index.tsx` (app root).
- UI: React components in `Components/*.tsx` (e.g., `Components/PromptBar.tsx`).
- Utilities: `utils.ts` (canvas, assets, helpers).
- Static assets: `public/` (SVGs, icons); global styles in `index.css`.
- Config: `vite.config.ts` (env injection, aliases), `tsconfig.json`.

## Build, Test, and Development Commands
- Install: `npm install`
- Configure API key: create `.env.local` with `GEMINI_API_KEY=YOUR_KEY`.
  - Vite maps this to `process.env.API_KEY` (see `vite.config.ts`).
- Develop: `npm run dev` (Vite dev server).
- Build: `npm run build` (production bundle in `dist/`).
- Preview: `npm run preview` (serve built app).

## Coding Style & Naming Conventions
- Language: TypeScript + React (ESM). Use functional components.
- Files: Components in PascalCase (`MyWidget.tsx`); utilities in camelCase (`utils.ts`).
- Code style: 2‑space indent, semicolons, single quotes, concise props.
- Imports: group by std/libs/local; prefer named imports.
- Licensing: many files include Apache 2.0 headers—preserve these when editing or creating similar files.

## Testing Guidelines
- No test runner is configured yet. If adding tests, prefer Vitest + React Testing Library.
- Place tests next to sources as `*.test.ts`/`*.test.tsx` and keep them fast and deterministic.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…).
- PRs must include: clear description, linked issues, screenshots/GIFs for UI changes, steps to verify, and any config/env updates.
- Before opening a PR: run `npm run build` and test the affected flows locally.

## Security & Configuration Tips
- Never commit secrets. `.env.local` is git‑ignored; store `GEMINI_API_KEY` there.
- Do not hardcode keys; all runtime access goes through `process.env.API_KEY`.
- When sharing logs or reproductions, redact credentials and user data.

