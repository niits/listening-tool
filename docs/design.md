# UI/UX Design Guide

## Design Principles

- Desktop-first (primary), tablet/mobile secondary
- Minimal UI — focus on the audio + typing loop
- Real-time feedback; no loading spinners for in-progress states if streaming is available
- Keyboard-driven workflow for power users
- Accessibility: semantic HTML, ARIA labels, WCAG AA contrast

---

## Color Palette

| Purpose | Tailwind Class | Hex |
|---|---|---|
| Correct word / Success | `green-500` | `#10b981` |
| Processing / Warning | `yellow-500` | `#f59e0b` |
| Error / Wrong word | `red-500` | `#ef4444` |
| Active / Info | `blue-500` | `#3b82f6` |
| Missing word | Orange dashed underline | `#f97316` |
| Extra word | Gray strikethrough | — |
| Text primary | `gray-900` | `#111827` |
| Text secondary | `gray-500` | `#6b7280` |
| Background | `white` / `gray-50` | `#ffffff` / `#f9fafb` |
| Borders | `gray-200` | `#e5e7eb` |

---

## Status Badges

Used on audio file cards and segment lists:

| Status | Color | Label |
|---|---|---|
| Not started | Gray | "Not Started" |
| In progress | Yellow | "Transcribing... X%" |
| Complete | Green | "Ready to Practice" |
| Error | Red | "Error" |

---

## Screen Layouts

### Home Screen

```
┌─────────────────────────────────────┐
│  [Enter MP3 file URL...]    [Go]    │  ← URL input
├─────────────────────────────────────┤
│  Cached Audio Files                 │
│  ┌──────────┐  ┌──────────┐        │
│  │ file.mp3 │  │ file2.mp3│  ...   │  ← Card grid
│  │ ● Ready  │  │ ◌ Pending│        │
│  └──────────┘  └──────────┘        │
└─────────────────────────────────────┘
```

### Processing Screen

```
┌─────────────────────────────────────┐
│  Processing: file.mp3               │
│  ████████████░░░░  65%              │  ← Overall progress
│  Transcribing segment 45/120...     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Live transcript text...     │    │  ← Streaming text
│  │ appears here as it streams  │    │
│  └─────────────────────────────┘    │
│                                     │
│  Segment Timeline:                  │
│  ██████████░░░░░░░░░░░░░░░░░░░░    │  ← Green/yellow/gray bars
│                                     │
│       [Cancel]  [Run in Background] │
└─────────────────────────────────────┘
```

### Practice Screen

```
┌───────────────┬─────────────────────┐
│  Sentence     │  Audio Player       │  ← 25% | 75%
│  List         │  [◄ ► ▶]  1x  [⟳] │
│  ─────────    ├─────────────────────┤
│  1. "Hello..." │  Type what you hear │
│  ✅ 100%      │  ┌─────────────────┐│
│  ─────────    │  │                 ││  ← Textarea
│  2. "World..." │  │                 ││
│  🎯 active    │  └─────────────────┘│
│  ─────────    │  [◄ Prev] [Show]    │
│  3. "How..."  │  [Check] [Next ►]   │
│  ⚪ pending   ├─────────────────────┤
│               │  Result:            │
│               │  "the quick fox"    │  ← Diff display
│               │   92% Correct       │
└───────────────┴─────────────────────┘
```

---

## Component Specifications

### Audio File Card

```
┌────────────────────────────┐
│  podcast-episode.mp3       │  ← file name
│  http://example.com/...    │  ← URL (truncated)
│  Added: Jan 11, 2024       │  ← date
│  ● Ready to Practice       │  ← status badge (color-coded)
└────────────────────────────┘
```

Hover state: slight shadow + cursor pointer. Clickable entire card.

### Segment Timeline

Horizontal bar visualization for transcription progress:
- Bar height: ~8px (half line height)
- Segment widths: proportional to audio duration
- Multiple rows if needed for long audio (wrap)
- Colors: Green (done), Yellow pulsing (current), Gray (pending)
- Clickable segments → seek to timestamp

### Word Diff Display

After answer checking, show word-by-word comparison:

```
Your answer:
  [the] [quick] [brown] [fox]
   ✓     ✓       ✗       ✓

Color map:
- "the" → green background (correct)
- "quick" → green (correct)
- "brown" → red background (wrong — user typed different word)
- "fox" → green (correct)
- [missing] → orange dashed underline
- [extra] → gray strikethrough
```

---

## Animations

```css
/* Loading spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Pulsing (currently transcribing segment) */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Smooth transitions (navigation, state changes) */
transition: all 0.2s ease;

/* 100% correct celebration */
/* Confetti or scale-up animation on the score display */
```

---

## Keyboard Shortcuts

| Key | Action | Screen |
|---|---|---|
| `Space` | Play / Pause audio | Practice |
| `Ctrl+R` | Replay current sentence | Practice |
| `Ctrl+→` | Next sentence | Practice |
| `Ctrl+←` | Previous sentence | Practice |
| `Ctrl+Enter` | Check answer | Practice |
| `Esc` | Go back / close modal | All |

---

## Responsive Design

**Desktop** (primary, ≥ 1024px): Full two-column practice layout.

**Tablet** (768-1023px): Collapsible sidebar, stacked controls.

**Mobile** (< 768px): Single column, sidebar as bottom sheet or hidden with toggle.

Use Tailwind responsive prefixes: `md:`, `lg:`.

---

## Accessibility Requirements

- All interactive elements keyboard-navigable
- `<button>` for actions, `<a>` for navigation
- ARIA labels for icon-only buttons (play, replay, next, prev)
- `aria-live="polite"` for status updates (transcription progress, score)
- Color is never the sole indicator — always pair with icon or text
- Focus indicators visible (don't remove outline without replacement)
- Contrast ratio ≥ 4.5:1 for normal text (WCAG AA)

---

## UI Components (shadcn/ui)

Use shadcn/ui primitives for consistency:
- `Button` — all action buttons
- `Input` — URL input field
- `Progress` — progress bars
- `Badge` — status badges
- `Dialog/Modal` — error modal, session summary, model loading overlay
- `Textarea` — dictation input area
- `Tooltip` — keyboard shortcut hints

Custom components for:
- Segment timeline visualization
- Word diff display
- Audio waveform (optional)
- Speed selector
