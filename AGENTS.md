# Repository Guidelines

## Skills to adhere to

- `$frontend-design` for general frontend UI design guidelines
- `$vercel-react-best-practices` for Next.js and React best practices
- `$shadcn` for shadcn components
- `$supabase-postgres-best-practices` for Supabase

## Coding Style & Naming Conventions

- Stack: Next.js, TypeScript, Shadcn, Supabase
- Formatting: 2-space indentation; favor descriptive names. Keep JSX lean and extract shared pieces into `components/`.
- Styling: Tailwind-first. Use shadcn components instead of custom components when available.
- Linting: Align with `next lint`; avoid disabling rules unless justified in-line.
- General: favor simplicity, conciseness, and readability while following best practices.

## Testing Guidelines

- No automated test suite is present yet.
- The agent should not attempt to run `npm install` or `npm run dev`. Ask the programmer to test or install additional libraries if necessary. The agent may run commands like `npm run test` or `npm run build` to verify code works.

## Configuration & Security Tips

- Required env vars: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`; never commit secrets.
- When adding Supabase or other API usage, guard against missing env vars and handle unauthenticated states gracefully (see `lib/supabaseClient.ts` and `contexts/AuthContext` patterns).
