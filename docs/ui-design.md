# UI Design Specification — Listening Practice Tool

> Implementation guide for the full UI redesign. All Tailwind classes are exact — copy them directly.
>
> **Priority:** MacBook (desktop, 1280px+) is the primary target. iPad (768–1024px) is secondary. Mobile is supported but not the focus.

---

## 1. Design System

### 1.1 Color Tokens

The palette is white/blue for light mode with full dark mode support via Tailwind's `dark:` prefix. Enable `darkMode: 'class'` in `tailwind.config.ts`.

| Role | Light | Dark |
|------|-------|------|
| Page background | `bg-white` or `bg-gray-50` | `dark:bg-gray-900` |
| Surface (cards, panels) | `bg-white` | `dark:bg-gray-800` |
| Border | `border-gray-200` | `dark:border-gray-700` |
| Text — primary | `text-gray-900` | `dark:text-gray-100` |
| Text — secondary | `text-gray-500` | `dark:text-gray-400` |
| Text — caption | `text-gray-400` | `dark:text-gray-500` |
| Accent (interactive) | `bg-blue-500`, `text-blue-600` | `dark:bg-blue-600`, `dark:text-blue-400` |
| Success | `bg-green-500`, `text-green-600` | `dark:bg-green-600`, `dark:text-green-400` |
| Warning / in-progress | `bg-amber-400`, `text-amber-500` | same |
| Error | `bg-red-400`, `text-red-500` | `dark:bg-red-500`, `dark:text-red-400` |

**Word diff colors** (TokenDisplay):
| Token type | Class | Visual meaning |
|------------|-------|---------------|
| `correct` | `text-green-600 dark:text-green-400` | User typed it right |
| `incorrect` | `text-red-500 line-through` | User typed a different word |
| `missing` | `text-gray-400 underline` | User skipped this word (reference shown) |
| `extra` | `text-amber-500 italic` | User typed a word not in the reference |

**Segment bar colors** (SegmentBar):
| State | Class |
|-------|-------|
| Pending | `bg-gray-300 dark:bg-gray-600` |
| Transcribing (active) | `bg-amber-400 animate-pulse` |
| Done | `bg-green-500` |
| Error | `bg-red-300 dark:bg-red-700` |

### 1.2 Typography

| Level | Classes |
|-------|---------|
| Page title | `text-lg font-semibold text-gray-900 dark:text-gray-100` |
| Section label | `text-sm font-medium text-gray-500 dark:text-gray-400` |
| Body | `text-sm text-gray-700 dark:text-gray-300` |
| Caption | `text-xs text-gray-400 dark:text-gray-500` |
| Monospace (diff) | `font-mono text-base` |

### 1.3 Component Primitives

**Card:**
```
rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
```

**Button — primary:**
```
rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium px-5 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
```

**Button — secondary (outline):**
```
rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed
```

**Button — ghost:**
```
rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm px-3 py-1.5 transition-colors
```

### 1.4 Button Loading States

Every button that triggers an async action must show a loading indicator while the operation is in progress. The button is disabled during loading to prevent double-submission.

**Pattern — inline spinner + label:**
```tsx
<button
  disabled={isLoading}
  class="min-w-[120px] flex items-center justify-center gap-2 [button classes] disabled:opacity-70 disabled:cursor-not-allowed"
>
  {isLoading ? (
    <>
      <svg class="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {loadingLabel}
    </>
  ) : label}
</button>
```

**Loading labels per button:**

| Button | Idle | Loading |
|--------|------|---------|
| Start Practicing | `Start Practicing →` | `Loading...` |
| Check Answer | `Check Answer` | `Checking...` |
| Delete audio (×) | `×` | spinner only, no text |
| Try Again | `Try Again` | — (synchronous, no loading needed) |
| ← Prev / Next → | navigation labels | — (synchronous) |

**Notes:**
- `min-w-[120px]` on the button prevents layout shift when the label changes between idle and loading.
- Use `disabled:opacity-70` during loading (not `opacity-40`) — button stays clearly visible, just non-interactive.
- Icon-only buttons (delete ×) replace the icon with the spinner, keeping the same size.

### 1.5 Motion & Animation (motion.dev)

Install: `yarn add motion`

Import: `import { motion, AnimatePresence } from 'motion/react'`

> Use motion for transitions that communicate **state changes** (appear/disappear, status shift, success feedback). Do not animate decorative or always-visible elements.

#### Segment bars — status color transition

When a bar changes status (pending → transcribing → done), animate the color and scale:

```tsx
// In SegmentBar.tsx — replace <div> with <motion.div>
<motion.div
  key={seg.index}
  layout                           // smoothly reflow if widths change
  animate={{ opacity: 1, scaleY: 1 }}
  initial={{ opacity: 0, scaleY: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
  className={`h-2 rounded-full flex-shrink-0 ${colorClass(seg.status)}`}
  style={{ width: barWidth }}
/>
```

Color transition (pending→amber→green) happens via Tailwind class swap, which is instant. To animate it smoothly, use `animate` with an inline `backgroundColor`:

```tsx
const bgColor = {
  pending:      '#d1d5db',   // gray-300
  transcribing: '#fbbf24',   // amber-400
  done:         '#22c55e',   // green-500
  error:        '#fca5a5',   // red-300
}

<motion.div
  animate={{ backgroundColor: bgColor[seg.status] }}
  transition={{ duration: 0.4, ease: 'easeInOut' }}
  ...
/>
```

#### Segment bars — initial mount (stagger)

When the segment list first appears after splitting, stagger-reveal each bar:

```tsx
// Parent wrapper
<motion.div className="flex flex-wrap gap-1 w-full">
  {segments.map((seg, i) => (
    <motion.div
      key={seg.index}
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ delay: i * 0.015, duration: 0.2 }}  // 15ms stagger
      ...
    />
  ))}
</motion.div>
```

#### Result card — appear after Check

The word diff card animates in after the user clicks Check Answer:

```tsx
<AnimatePresence mode="wait">
  {hasChecked ? (
    <motion.div
      key="result"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="rounded-xl border ..."
    >
      {/* word diff */}
    </motion.div>
  ) : (
    <motion.div
      key="input"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {/* textarea */}
    </motion.div>
  )}
</AnimatePresence>
```

#### Perfect score celebration

When the user gets a perfect score, animate the result card border/background + a scale pop on the checkmark icon:

```tsx
// Card container
<motion.div
  initial={{ scale: 0.97, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
  className="rounded-xl border border-green-200 bg-green-50 ..."
>

  {/* Checkmark icon pop */}
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
  >
    <CheckCircleIcon className="h-5 w-5 text-green-500" />
  </motion.div>

</motion.div>
```

#### Segment navigation transition (main content)

When the user moves to a different segment (Prev/Next or sidebar click), slide the content area:

```tsx
// Determine direction: +1 = forward (slide left), -1 = backward (slide right)
const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
}

<AnimatePresence custom={direction} mode="wait">
  <motion.div
    key={currentIndex}
    custom={direction}
    variants={variants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.2, ease: 'easeInOut' }}
    className="flex-1 overflow-y-auto px-8 py-8"
  >
    {/* AudioPlayer + Input/Result */}
  </motion.div>
</AnimatePresence>
```

#### Sidebar active item indicator

The blue left-border active indicator slides between items instead of jumping:

```tsx
// Use layoutId to share the animated element across items
{isActive && (
  <motion.div
    layoutId="active-segment-indicator"
    className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
  />
)}
```

Each sidebar button needs `position: relative` and the indicator sits behind the text (`z-0` indicator, `z-10` text).

#### Toast / status message

Status messages on the processing screen fade in/out:

```tsx
<AnimatePresence mode="wait">
  <motion.p
    key={statusMessage}
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.2 }}
    className="text-sm text-gray-500"
  >
    {statusMessage}
  </motion.p>
</AnimatePresence>
```

#### Summary table

| Location | Effect | API used |
|----------|--------|----------|
| Segment bars — mount | Stagger reveal | `motion.div` initial/animate + delay |
| Segment bars — status change | Color crossfade | `animate={{ backgroundColor }}` |
| Input ↔ Result swap | Slide + fade | `AnimatePresence mode="wait"` |
| Perfect score card | Scale spring pop | `type: 'spring'` |
| Checkmark icon | Pop in | `type: 'spring'` with delay |
| Prev/Next navigation | Directional slide | `AnimatePresence` + custom variants |
| Sidebar active indicator | Slide between items | `layoutId` |
| Processing status text | Fade crossfade | `AnimatePresence mode="wait"` |

---

## 2. Layout Constraints

- **All screens** use `h-screen` as the root — no full-page scroll.
- Scrollable regions use `overflow-y-auto` locally (sidebar, main content area).
- **Primary target: MacBook** (1280px+). Designs are specified at this size first.
- Breakpoints (Tailwind default scale):
  - `lg` 1024px — laptop / iPad landscape
  - `md` 768px — iPad portrait
  - `sm` 640px — large phone
  - default (no prefix) — small phone (mobile-first Tailwind, design intent is desktop-first)
- Max content width: `max-w-2xl` on processing/home screens; practice screen uses full viewport width with `max-w-5xl`.
- Horizontal padding: `px-6 md:px-8 lg:px-10` on home/processing; `px-0` on practice (full-bleed sidebar layout).
- Sidebar width on practice screen: `w-56` on MacBook, `w-48` on iPad (`md:w-48 lg:w-56`).

---

## 3. Screens

### 3.1 Home Screen (`/`)

```
┌─────────────────────────────────────────────────────┐  h-screen flex flex-col
│  Listening Practice               [☀/☾ toggle]      │  h-14, border-b, px-4
├─────────────────────────────────────────────────────┤  flex-1 overflow-y-auto
│                                                     │
│   max-w-2xl mx-auto w-full px-4 py-8                │
│                                                     │
│   ┌──────────────────────────────────────────────┐  │
│   │  https://...             [Start Practicing]  │  │  URL input + submit
│   └──────────────────────────────────────────────┘  │
│                                                     │
│   ─── Saved Audio ─────────────────────────────     │  section label, mt-8
│                                                     │
│   ┌──────────────────────────────────────────────┐  │  audio card
│   │  BBC News Podcast                      [×]   │  │
│   │  12 segments · 2 hours ago                   │  │  text-xs text-gray-400
│   │  ████████████████░░░░  8/12 transcribed      │  │  progress bar + label
│   └──────────────────────────────────────────────┘  │
│                                                     │
│   (empty state if no audio)                         │
│   ┌──────────────────────────────────────────────┐  │
│   │       No audio saved yet.                    │  │
│   │  Paste a URL above to get started.           │  │
│   └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**URL Input:**
```
<form class="flex gap-2">
  <input
    type="url"
    class="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    placeholder="https://..."
  />
  <button type="submit" class="[primary button classes]">
    Start Practicing
  </button>
</form>
```

**Audio Card:**
```
<div class="[card classes] p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
  <div class="flex items-start justify-between gap-2">
    <div>
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
      <p class="text-xs text-gray-400 mt-0.5">{segmentCount} segments · {relativeTime}</p>
    </div>
    <button class="[ghost button] text-gray-400 hover:text-red-500">×</button>
  </div>
  <div class="mt-3 flex items-center gap-2">
    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
      <div class="h-full bg-blue-500 rounded-full transition-all" style="width: {percent}%"></div>
    </div>
    <span class="text-xs text-gray-400">{done}/{total}</span>
  </div>
</div>
```

**Click behavior:** If fully transcribed → navigate to `/practice?url=...`. If partial → navigate to `/processing?url=...`.

---

### 3.2 Processing Screen (`/processing`)

```
┌─────────────────────────────────────────────────────┐  h-screen flex flex-col bg-white dark:bg-gray-900
│  ← Back    {audio name, truncated}                  │  h-14 border-b px-4 flex items-center gap-3
├─────────────────────────────────────────────────────┤  flex-1 flex flex-col overflow-hidden
│                                                     │
│  ⟳  Transcribing 4 / 12…          [progress line]  │  shrink-0 px-6 pt-5 pb-3
│  ─────────────────────────────────────────────────  │  h-px progress bar (animated width)
│                                                     │
│  0m  ████░░░░████████░░░████░░░░░░░████░░████████  │  flex-1 min-h-0 overflow-y-auto px-6 pb-4
│  1m  ░░░░████░░████░░░░████████░░░░████░░░░░░████  │  SegmentBar — timeline rows, adaptive height
│  2m  ████░░░░░░░░████████░░░████░░░░░░████████░░  │  (each row = 1 min of audio)
│  …                                                  │
│                                                     │
├─────────────────────────────────────────────────────┤  shrink-0 border-t border-gray-100 px-6 py-4
│  8 / 12 segments            [Start Practicing →]   │  flex items-center justify-between
└─────────────────────────────────────────────────────┘
```

**SegmentBar — timeline visualization (`components/SegmentBar.tsx`):**

Audio is divided into 60-second rows. Each segment is positioned absolutely within its row using `left` and `width` percentages derived from the segment's start/end times relative to the row's time window. Silence gaps appear as the track background.

Row height adapts to the number of rows so the chart always fills the available space readably:

| Row count | Row height |
|-----------|-----------|
| ≤ 3 | 56 px |
| ≤ 6 | 44 px |
| ≤ 12 | 36 px |
| ≤ 24 | 28 px |
| 25+ | 20 px |

**Loading placeholder (`TimelinePlaceholder`):**
Before segments arrive, render 4 pulsing skeleton rows at 44 px height with the same label gutter as real rows (so the layout doesn't shift on first paint).

**Status message states:**
| Stage | Message |
|-------|---------|
| `loading` | "Loading audio…" |
| `splitting` | "Detecting speech segments…" |
| `transcribing` | "Transcribing {done} / {total}…" |
| `done` | "✓ Ready" (green) |
| `error` | "Something went wrong." |

**Progress bar:** `h-px` line beneath the status text. Animates from `0%` to `100%` as segments are transcribed. Turns green on done. Hidden until at least one segment exists.

**Auto-transition logic:**
```ts
useEffect(() => {
  if (doneCount === totalCount && totalCount > 0) {
    const t = setTimeout(() => router.replace('/practice?url=...'), 1500)
    return () => clearTimeout(t)
  }
}, [doneCount, totalCount])
```

"Start Practicing →" button appears when `doneCount >= 1` and skips the auto-transition delay.

**Remove:** `QueueSidebar` is not shown on this screen.

---

### 3.3 Practice Screen (`/practice`)

**Root:** `h-screen flex flex-col bg-white dark:bg-gray-900 overflow-hidden`

#### MacBook / Desktop (lg: 1024px+) — Primary

```
┌─────────────────────────────────────────────────────────────────┐  h-screen
│  ← Back                            Segment 3 / 12               │  h-14 border-b px-8
│                                                                   │  flex items-center justify-between
├───────────────────┬─────────────────────────────────────────────┤  flex-1 overflow-hidden flex
│  w-56 shrink-0    │  flex-1 overflow-y-auto                     │
│  border-r         │  px-8 py-8 max-w-2xl space-y-5             │
│  overflow-y-auto  │                                              │
│  py-3             │  ┌── Audio Player ───────────────────────┐  │
│                   │  │  ▶  ══════════════════════════  0:06  │  │
│  1  0:00–0:05     │  └───────────────────────────────────────┘  │
│  2  0:05–0:12     │                                              │
│ ▶3  0:12–0:18     │  ┌── Input / Result ─────────────────────┐  │
│  4  0:18–0:25     │  │  [textarea]   OR   [word diff]         │  │
│  5  0:25–0:31     │  └───────────────────────────────────────┘  │
│  ...              │                                              │
│                   │  [score + Try Again, if checked]            │
├───────────────────┴─────────────────────────────────────────────┤  h-16 border-t shrink-0
│  [← Prev]               [Check Answer]              [Next →]   │  px-8 flex items-center justify-between
└─────────────────────────────────────────────────────────────────┘
```

#### iPad (md: 768px–1023px)

Same structure as MacBook but `w-48` sidebar, `px-6 py-6`, slightly tighter spacing.

#### Mobile (< md: < 768px)

```
┌─────────────────────────────────────────┐  h-screen
│  ← Back               Segment 3 / 12   │  h-14 border-b px-4
├─────────────────────────────────────────┤  h-10 border-b overflow-x-auto flex-shrink-0
│  [1] [2] [▶3] [4] [5] [6] ...          │  horizontal segment chips (replaces sidebar)
├─────────────────────────────────────────┤  flex-1 overflow-y-auto
│  px-4 py-4 space-y-4                   │
│  [Audio Player]                         │
│  [Input / Result]                       │
│  [Score]                                │
├─────────────────────────────────────────┤  h-16 border-t shrink-0
│  [← Prev]  [Check Answer]  [Next →]    │
└─────────────────────────────────────────┘
```

---

### 3.4 Sidebar Segment List (`components/SegmentList.tsx`)

**Props:**
```ts
interface SegmentListProps {
  segments: SegmentItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  variant?: "sidebar" | "strip";
  // "sidebar" — desktop vertical nav only (hidden on mobile)
  // "strip"   — mobile horizontal chip strip only (hidden on desktop)
  // omit      — render both (legacy)
}
```

**Usage in practice page** — render each variant separately to fix layout stacking on mobile:
```tsx
{/* Mobile strip — renders above the horizontal flex row */}
<SegmentList ... variant="strip" />

<div className="flex-1 flex overflow-hidden">
  {/* Desktop sidebar — inside the horizontal flex row */}
  <SegmentList ... variant="sidebar" />
  <main>...</main>
</div>
```

**Desktop/iPad sidebar** (`hidden md:flex md:w-48 lg:w-56`):

Each row shows: index number · start timestamp · perfect-score badge (✓).

```tsx
<nav class="hidden md:flex md:w-48 lg:w-56 shrink-0 flex-col border-r ... overflow-y-auto py-3">
  {segments.map((seg) => (
    <button class="... border-l-2 border-blue-500 (active) | border-transparent (inactive)">
      {/* Animated background via motion.div layoutId="active-segment-indicator" */}
      <span class="w-5 text-right text-xs text-gray-400">{seg.index + 1}</span>
      <span class="text-xs tabular-nums">{formatTime(seg.start)}</span>
      {seg.perfectScore && <span class="ml-auto text-green-500 text-xs">✓</span>}
    </button>
  ))}
</nav>
```

**Mobile horizontal strip** (`flex md:hidden`, `h-10 border-b overflow-x-auto`):

Circular chips showing index number. Active = blue, perfect = green tint, default = gray.

```tsx
<div class="flex gap-1 px-3 py-1.5 overflow-x-auto md:hidden border-b ... h-10 items-center">
  {segments.map((seg) => (
    <button class="shrink-0 h-7 w-7 rounded-full text-xs font-medium ...">
      {seg.index + 1}
    </button>
  ))}
</div>
```

---

### 3.5 Audio Player Card

```tsx
<div class="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
  {/* Header — absolute position within the full audio */}
  <div class="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/60">
    <span class="text-xs text-gray-400 font-mono tabular-nums">
      {formatTime(seg.start)} – {formatTime(seg.end)}
    </span>
    <span class="text-xs text-gray-300 font-mono tabular-nums">
      {seg.duration.toFixed(1)}s
    </span>
  </div>

  {/* Playback controls */}
  <div class="px-4 py-3 flex items-center gap-3">
    <button onClick={togglePlay} disabled={!audioReady}
      class="h-9 w-9 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40">
      {isPlaying ? <PauseIcon /> : <PlayIcon />}
    </button>

    {/* Seek bar — expanded hit area via -my-2 py-2 so clicks register more easily */}
    <div class="flex-1 flex items-center cursor-pointer -my-2 py-2" onClick={handleSeek}>
      <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full relative pointer-events-none">
        <div class="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
             style={{ width: `${progress * 100}%` }} />
        {/* Scrubber thumb */}
        <div class="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-blue-500 shadow-sm -translate-x-1/2"
             style={{ left: `${progress * 100}%` }} />
      </div>
    </div>

    {/* current / total */}
    <span class="text-xs text-gray-400 shrink-0 font-mono tabular-nums whitespace-nowrap">
      {formatTime(currentTime)} / {formatTime(totalTime)}
    </span>
  </div>
</div>
```

**Behavior:**
- Plays only the current segment's `[start, end]` range from the full audio buffer.
- Does **not** auto-play on navigation — user initiates playback.
- When playback ends, progress stays at 1.0 (end position); pressing play again restarts from beginning.
- Clicking seek while audio is not playing immediately starts playback from that position.
- Progress tracks position within the segment (0–duration), not within the full file.
- Seek hit area is ~28 px tall (via `-my-2 py-2`) though the visual bar remains `h-1.5`.

---

### 3.6 Input Card (before checking)

```tsx
<div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition">
  <textarea
    value={userInput}
    onChange={e => setUserInput(e.target.value)}
    class="w-full p-4 text-base bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none min-h-[100px] placeholder:text-gray-400"
    placeholder="Type what you hear..."
    onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleCheck() }}
  />
</div>
```

---

### 3.7 Result Card (after checking)

**Normal result:**
```tsx
<div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
  {/* Word diff */}
  <div class="flex flex-wrap gap-x-2 gap-y-1.5 font-mono text-base leading-relaxed">
    {tokens.map((tok, i) => (
      <span key={i} class={tokenClass(tok.type)}>{tok.text}</span>
    ))}
  </div>
  {/* Score */}
  <p class="text-sm text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">
    Score: {correctCount} / {referenceCount} — {Math.round(score * 100)}%
  </p>
</div>
```

**Perfect result (score = 1.0, no extra words):**
```tsx
<div class="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 space-y-3">
  <div class="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
    <CheckCircleIcon class="h-5 w-5" />
    Perfect!
  </div>
  <div class="flex flex-wrap gap-x-2 gap-y-1.5 font-mono text-base">
    {tokens.map((tok, i) => (
      <span key={i} class="text-green-600 dark:text-green-400">{tok.text}</span>
    ))}
  </div>
  {!isLastSegment && (
    <p class="text-xs text-gray-400 pt-1 border-t border-green-100 dark:border-green-800">
      Moving to next segment in 2s... or press Next →
    </p>
  )}
</div>
```

**Token CSS helper:**
```ts
function tokenClass(type: TokenClass): string {
  switch (type) {
    case 'correct':   return 'text-green-600 dark:text-green-400'
    case 'incorrect': return 'text-red-500 line-through'
    case 'missing':   return 'text-gray-400 dark:text-gray-500 underline'
    case 'extra':     return 'text-amber-500 italic'
  }
}
```

---

### 3.8 Footer Action Bar

```tsx
<footer class="h-16 shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 md:px-6 flex items-center justify-between bg-white dark:bg-gray-900">
  {/* Hide both prev/next when only 1 segment */}
  {totalSegments > 1 ? (
    <button onClick={goPrev} disabled={currentIndex === 0} class="[secondary button]">
      ← Prev
    </button>
  ) : <div />}

  {hasChecked ? (
    <button onClick={resetInput} class="[secondary button]">
      Try Again
    </button>
  ) : (
    <button onClick={handleCheck} class="[primary button] px-8">
      Check Answer
    </button>
  )}

  {totalSegments > 1 ? (
    <button
      onClick={goNext}
      disabled={currentIndex === totalSegments - 1 || !segments[currentIndex + 1]?.transcribed}
      class={cn(
        '[secondary button]',
        isPerfect && 'border-green-400 text-green-600 dark:border-green-600 dark:text-green-400',
      )}
    >
      Next →
    </button>
  ) : <div />}
</footer>
```

---

## 4. Behavior Specification

### 4.1 Scoring Logic

- **Score** = `correctCount / referenceTokenCount` (0–1 float)
- **Perfect** = `score === 1.0` AND `extraCount === 0`
- Extra words count as non-perfect but do NOT reduce the score numerator
- Empty input → all reference tokens become `missing`, score = 0

### 4.2 Navigation Between Segments

- **Next** button: disabled if next segment has no transcript yet (still transcribing)
- **Prev** button: disabled at index 0
- Clicking sidebar item: jumps directly (always allowed unless segment errored)
- After perfect score: auto-advance to next after 2s; clicking "Next →" cancels timeout

### 4.3 Saving Results

- On perfect score: call `saveSession()` → writes to IndexedDB `sessions` table
- Sidebar shows `✓` badge for segments with a saved perfect score in current session
- "Save & Exit" (optional, if screen real estate allows): saves current progress and returns home

### 4.4 Dark Mode Toggle

- Store preference in `localStorage` key `'theme'`
- On mount: read from localStorage; fall back to `window.matchMedia('prefers-color-scheme')`
- Toggle adds/removes `dark` class on `document.documentElement`
- Icon: sun (☀) in dark mode, moon (☾) in light mode

### 4.5 Audio Playback

- Use Web Audio API `AudioBufferSourceNode` or `<audio>` element with offset seek
- When segment changes: stop current playback, seek to `segment.start`, auto-play
- Progress = `(currentTime - segment.start) / segment.duration`

---

## 5. Silence Splitter (`lib/silenceSplitter.ts`)

The splitter divides raw PCM into sentence-level segments before transcription. It runs entirely in the browser (no server required).

### Algorithm (in order)

1. **Frame energy** — divide audio into 30 ms frames, compute RMS per frame.
2. **Adaptive threshold** — sort frame energies; take 10th-percentile RMS as noise floor; threshold = `noiseFloor × 6` (~15 dB above floor). Falls back to fixed `-35 dB` when the recording is near-silent. This handles both quiet studios and noisy rooms.
3. **Silence classification** — frame is silent if `rms < threshold`.
4. **Split points** — find silence runs ≥ `minSilenceDurationMs`; use the midpoint of each run as the split point.
5. **Raw segments** — slice between consecutive split points.
6. **Discard short fragments** — drop segments shorter than `minSegmentDurationMs`.
7. **Merge close segments** — merge adjacent segments whose gap < `mergeGapMs` (safety net for artefacts), provided the merged total ≤ `maxSegmentDurationS`.
8. **Smart force-split** — if a segment exceeds `maxSegmentDurationS`, find the *longest internal silence run* and split at its midpoint. Falls back to arithmetic midpoint only if no qualifying silence exists.

### Default config (`DEFAULT_SILENCE_CONFIG`)

| Field | Value | Rationale |
|-------|-------|-----------|
| `frameDurationMs` | 30 ms | Standard for energy-based VAD |
| `silenceThresholdDb` | −35 dB | Fallback fixed threshold |
| `minSilenceDurationMs` | **600 ms** | In-sentence breath pauses ~200–400 ms; sentence boundaries ≥ 600 ms |
| `minSegmentDurationMs` | **1500 ms** | Sentences in natural speech rarely < 1.5 s |
| `maxSegmentDurationS` | **15 s** | Keeps segments short enough for dictation practice; Whisper-style models perform well up to ~30 s |
| `mergeGapMs` | **400 ms** | Only merges fragments < 400 ms apart; does not merge sentence-boundary silences |

### Effective split threshold

With `minSilenceDurationMs = 600 ms` and `mergeGapMs = 400 ms`, the effective sentence-boundary threshold is ~600 ms. Pauses shorter than 600 ms are never detected as split points; gaps between 400–599 ms could in theory be merged back (but since they can't be split in the first place, the merge step is mostly a no-op with these settings).

---

## 6. Edge Cases

| Scenario | Handling |
|----------|----------|
| Segment duration < 0.5s | Minimum bar width `6px` |
| Segment duration ≥ 25s (max) | Maximum bar width `25%` of container |
| Transcription failed for a segment | Bar: `bg-red-300`; sidebar item: disabled + grayed; practice screen shows "No transcript available" |
| Empty textarea on Check | All reference tokens classified `missing`; score = 0% |
| User types extra words | Displayed in `amber-500 italic`; doesn't reduce score; blocks perfect |
| Single segment audio | Hide Prev/Next buttons entirely (not just disabled) |
| Last segment + perfect | No auto-advance; show "All done!" message instead |
| Returning to fully-transcribed audio | Home screen navigates directly to `/practice`, skipping `/processing` |
| Background transcription still running during practice | Show a subtle banner: "Transcription still running for some segments" |

---

## 7. Files Reference

| File | Role |
|------|------|
| `app/globals.css` | `@custom-variant dark` for class-based dark mode |
| `app/layout.tsx` | Injects `theme-init.js` before hydration; `suppressHydrationWarning` on `<html>` |
| `public/theme-init.js` | Reads `localStorage['theme']`, sets `dark` class before first paint (prevents FOUC) |
| `components/DarkModeToggle.tsx` | Sun/moon toggle; persists to `localStorage['theme']` |
| `components/SegmentBar.tsx` | Timeline visualization; 60 s rows; adaptive row height; absolute-positioned segments |
| `components/SegmentList.tsx` | Segment nav; `variant="sidebar"` or `variant="strip"` |
| `components/TokenDisplay.tsx` | Word-diff display; color per token class |
| `app/page.tsx` | Home screen; `h-screen` layout; dark mode classes |
| `app/processing/page.tsx` | Processing screen; `flex-1` visualization; timeline SegmentBar; progress bar |
| `app/practice/page.tsx` | Practice screen; sidebar + strip layout; audio player; input/result |
| `lib/silenceSplitter.ts` | Adaptive silence segmentation; see Section 5 for config reference |

---

## 8. Implementation Order

1. `app/globals.css` — `@custom-variant dark`
2. `public/theme-init.js` + `app/layout.tsx` — FOUC prevention
3. `components/DarkModeToggle.tsx` — toggle component
4. `components/SegmentBar.tsx` — timeline visualization
5. `components/TokenDisplay.tsx` — token colors
6. `components/SegmentList.tsx` — sidebar + strip with `variant` prop
7. `lib/silenceSplitter.ts` — adaptive splitter
8. `app/processing/page.tsx` — layout redesign
9. `app/practice/page.tsx` — full redesign with sidebar
8. `app/page.tsx` — theme update
