# Coding Standards

Standards for consistent, maintainable code in this project.

## General Principles

- Prioritize readability, maintainability, and replaceability
- Use descriptive naming — long clear names over short vague ones
- DRY: extract reusable logic into hooks, utils, or services
- Break complex features into small, focused units
- Write all code in TypeScript with strict mode
- Design for easy replacement and deletion
- Functions do one thing well at a single abstraction level
- Minimize API surface area
- Favor pure functions for testability
- Co-locate logic that changes together
- Group code by feature, not by type

---

## TypeScript

- **Strict mode**: `strict: true` in `tsconfig.json`
- **Type placement**: All types/interfaces in `lib/types.ts` (or `src/types/` after migration). Never define types inside component files.
- **Prefer `interface`** over `type` for object shapes
- **Use enums** for fixed sets of values
- Type inference where obvious — no need to annotate everything
- Define interfaces for all props and state shapes

```typescript
// Good: types in types.ts, imported where needed
// lib/types.ts
interface AudioFile {
  id?: number;
  url: string;
  fileName: string;
}

// components/AudioCard.tsx
import { AudioFile } from '@/lib/types';
interface Props { file: AudioFile; onSelect: () => void; }
```

---

## React Components

- **Functional components with hooks only** — no class components (except error boundaries)
- `React.memo` for components that receive stable props but render often
- Fragments (`<>...</>`) to avoid unnecessary DOM wrappers
- Keep components **< 200 lines** — extract logic to hooks or utils if longer
- Extract reusable stateful logic into **custom hooks** in `/hooks`
- Single responsibility per component
- Never mutate props or state directly

### Props

- Define `interface Props` for all components
- Use camelCase, destructure in function signature
- No prop drilling — use Context for shared state

```typescript
// Good
interface Props {
  segment: PracticeSentence;
  onCheck: (input: string) => void;
}

export function PracticeSegment({ segment, onCheck }: Props) {
  // ...
}
```

### State Management

- `useState` for component-local state
- `useReducer` for complex local state with multiple sub-values
- `Context API` (`TranscriptionContext`) for global transcription state
- No external state library unless complexity demands it

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Components | `PascalCase.tsx` | `AudioPlayer.tsx` |
| Hooks | `useFeatureName.ts` | `useAudioProcessing.ts` |
| Services | `feature.service.ts` | `audio.service.ts` |
| Utils/lib | `featureName.ts` | `silenceSplitter.ts` |
| Types file | `feature.ts` | `transcription.ts` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_SAMPLE_RATE` |
| Interfaces | `PascalCase` | `AudioFile`, `TranscriptionChunk` |
| CSS classes | Tailwind utilities | — |

---

## File Organization

- **One component per file**
- **No barrel files** — import directly from source, not from `index.ts`
- **Group by feature**, not by type
- Co-locate related logic that changes together
- Utilities and helpers go in `lib/`
- Documentation goes in `docs/`

**Current structure** (migration in progress to `src/` feature-based):
```
/components           # Current flat structure
/src/components/      # Planned feature-based target
  /home
  /practice
  /processing
  /shared
```

**New components** should go in `src/components/{feature}/` as the migration proceeds.

---

## Next.js Specific

- Use **App Router** for new pages
- Prefer **Server Components** for data fetching where applicable
- Use `next/image` for all images
- Use `next/font` for fonts
- Use `next/dynamic` for lazy loading heavy components
- File-system routing conventions
- **No barrel files** (`index.ts` re-exports)

---

## Styling

- **Tailwind CSS** utility classes
- Use **shadcn/ui** for common UI primitives (buttons, inputs, modals)
- Ensure scoped styles — avoid global class name collisions

**Color Palette (Tailwind):**

| Purpose | Color |
|---|---|
| Success / Correct | `green-500` (#10b981) |
| Warning / Processing | `yellow-500` (#f59e0b) |
| Error / Wrong | `red-500` (#ef4444) |
| Info / Active | `blue-500` (#3b82f6) |
| Missing word | Orange dashed underline |
| Extra word | Gray strikethrough |
| Text primary | `gray-900` |
| Text secondary | `gray-500` |
| Background | `white` / `gray-50` |
| Borders | `gray-200` |

---

## Performance

- **Unique, stable keys** for list rendering — no array indices as keys
- `React.lazy` + `Suspense` for code splitting heavy components
- `React.memo` for expensive renders
- **Virtualize long lists** (react-window) for segment sidebar in practice mode
- **Debounce** input handlers (300ms)
- **One concurrent transcription** at a time
- Revoke blob URLs when done; clear AudioContext buffers after processing

---

## Error Handling

- Validate at system boundaries: user input (URL format), audio fetch, Web Worker messages
- Trust internal function contracts — no defensive validation inside known call chains
- Show user-friendly error messages with retry options
- Log errors with context for debugging

```typescript
// Network errors
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
} catch (error) {
  // Show user-friendly error, offer retry
}

// Storage quota
const estimate = await navigator.storage.estimate();
if ((estimate.usage ?? 0) / (estimate.quota ?? Infinity) > 0.8) {
  // Warn user, offer cache clearing
}
```

---

## Comments and Documentation

- Comment the **"why"**, not the "what"
- Use JSDoc for public functions and complex utilities
- Document complex algorithms (see scoring.ts, silenceSplitter.ts)
- TODO comments for known future improvements
- All principal documentation in `docs/` folder

---

## Accessibility

- Semantic HTML elements (`<button>`, `<main>`, `<nav>`, etc.)
- ARIA labels on interactive controls that lack visible text
- Keyboard navigation for all interactive elements (see keyboard shortcuts in spec)
- Color contrast ≥ WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Announce status changes to screen readers (`aria-live`)
