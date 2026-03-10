# Tag Suggestions Dropdown — Design Doc

**Date:** 2026-03-10
**Status:** Approved
**Scope:** `src/pages/AddExpense.tsx` only

## Goal

When the user types ≥1 character in the tag input, show a dropdown of previously used tags filtered by prefix (sorted by frequency). If no match, show "Press Enter to add [tag]" as a fallback option.

## Data Source

Extract all tags from `expenses` (already in `useApp()` context). Filter out `'deleted'` system tag. Deduplicate and sort by frequency descending. Computed via `useMemo` to avoid recomputation on every render.

```ts
const tagSuggestions = useMemo(() => {
  const freq = new Map<string, number>();
  expenses.forEach(e =>
    e.tags?.filter(t => t !== 'deleted').forEach(t =>
      freq.set(t, (freq.get(t) || 0) + 1)
    )
  );
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}, [expenses]);
```

## Filtering Logic

- Show dropdown only when `tagInput.length >= 1`
- Filter `tagSuggestions` by `startsWith(tagInput)` (case-insensitive)
- Exclude tags already added to `tags` state
- If no matches → show "Press Enter to add [tagInput]" as last option

## Dropdown UI

- `position: absolute` below input, `z-50`
- `bg-gray-800 border border-gray-700 rounded-lg shadow-xl`
- Each suggestion: `px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer`
- Tag displayed with color chip from `getTagColor()`
- "Press Enter to add" option: `text-gray-500 italic`
- Click outside closes dropdown (useRef + useEffect)
- Esc key closes dropdown, preserves typed text

## State Changes

- Add `expenses` to `useApp()` destructure
- Add `showSuggestions: boolean` state
- Add `tagSuggestions` useMemo
- Wrap tag input in `relative` div
- `onChange`: show suggestions when `tagInput.length >= 1`
- Clicking suggestion: add tag, clear input, hide dropdown

## Files

- Modify: `src/pages/AddExpense.tsx` only
