# Task Manager API

## Stack
- Runtime: Node.js with Bun
- Language: TypeScript (strict mode)
- Framework: Express 4.x
- ORM: Prisma 6.x with PostgreSQL
- Testing: bun:test (built-in test runner)

## Commands
- Install: `bun install`
- Dev: `bun run dev`
- Build: `bun run build`
- Test: `bun test`
- Prisma migrate: `bunx prisma migrate dev`
- Prisma generate: `bunx prisma generate`

## Conventions
- Use bun over npm for all package management and script execution
- Use TypeScript strict mode
- Use ESM imports (project uses "type": "module")
- Keep Express route handlers in `src/routes/` or inline in `src/index.ts`
- Put Prisma client singleton in `src/lib/prisma.ts`
- Tests go in `__tests__/` or `*.test.ts` files
- Use descriptive HTTP status codes (201 for created, 204 for deleted, etc.)
- All error responses use format: `{ error: string, details?: string[] }`
