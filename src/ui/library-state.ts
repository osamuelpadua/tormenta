import { useLayoutEffect, useRef, useState } from "react";
import { EMPTY_FILTERS, type LibraryFilters } from "./library-data";

export interface LibraryState {
  scope: "mine" | "all";
  query: string;
  filters: LibraryFilters;
  sort: "name" | "page" | "circle" | "cost";
  page: number;
  favorites: boolean;
  filtersOpen: boolean;
  selectedId: string;
  scroll: number;
}
const fresh = (): LibraryState => ({
  scope: "mine",
  query: "",
  filters: { ...EMPTY_FILTERS },
  sort: "name",
  page: 0,
  favorites: false,
  filtersOpen: false,
  selectedId: "",
  scroll: 0,
});
export function loadLibraryState(key: string): LibraryState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!saved || !["mine", "all"].includes(saved.scope)) return fresh();
    return {
      ...fresh(),
      scope: saved.scope,
      query: typeof saved.query === "string" ? saved.query : "",
      filters: Object.fromEntries(
        Object.keys(EMPTY_FILTERS).map((key) => [
          key,
          typeof saved.filters?.[key] === "string" ? saved.filters[key] : "",
        ]),
      ) as unknown as LibraryFilters,
      sort: ["name", "page", "circle", "cost"].includes(saved.sort)
        ? saved.sort
        : "name",
      page: Number.isInteger(saved.page) && saved.page >= 0 ? saved.page : 0,
      favorites: saved.favorites === true,
      filtersOpen: saved.filtersOpen === true,
      selectedId: typeof saved.selectedId === "string" ? saved.selectedId : "",
      scroll:
        Number.isFinite(saved.scroll) && saved.scroll >= 0 ? saved.scroll : 0,
    };
  } catch {
    return fresh();
  }
}
export function useLibraryState(characterId: string, spells: boolean) {
  const key = `tormenta-library-v1:${characterId}:${spells ? "spells" : "powers"}`;
  const [state, setState] = useState(() => loadLibraryState(key));
  const current = useRef(state);
  current.current = state;
  const save = (value: LibraryState) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* In-memory navigation remains available when storage is full. */
    }
  };
  const update = (patch: Partial<LibraryState>) =>
    setState((previous) => {
      const next = { ...previous, scroll: current.current.scroll, ...patch };
      current.current = next;
      save(next);
      return next;
    });
  useLayoutEffect(() => {
    const restore = requestAnimationFrame(() =>
      window.scrollTo({ top: current.current.scroll, behavior: "instant" }),
    );
    let frame = 0;
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        current.current = { ...current.current, scroll: window.scrollY };
        save(current.current);
      });
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      cancelAnimationFrame(restore);
      cancelAnimationFrame(frame);
      save(current.current);
      window.removeEventListener("scroll", scroll);
    };
  }, [key]);
  return [state, update] as const;
}
