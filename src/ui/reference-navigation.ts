import { useEffect, useState } from "react";
import { ENTRY_MAP } from "../data/rules";
import { parseBookPage } from "./book-search";

export type Tab = "sheet" | "combat" | "powers" | "spells" | "inventory";
export interface ReferenceRoute {
  tab: Tab;
  entryId?: string;
  bookPage?: number;
  focus?: string;
}
const tabs = ["sheet", "combat", "powers", "spells", "inventory"];
export function readRoute(hash: string): ReferenceRoute {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const entryId = params.get("entry") ?? "";
  return {
    tab: tabs.includes(path) ? (path as Tab) : "sheet",
    ...(ENTRY_MAP.has(entryId) ? { entryId } : {}),
    ...(params.has("book") && parseBookPage(params.get("book")!) !== undefined
      ? { bookPage: parseBookPage(params.get("book")!) }
      : {}),
    ...(params.get("focus")
      ? { focus: params.get("focus")!.slice(0, 150) }
      : {}),
  };
}
export function routeHash(route: ReferenceRoute) {
  const params = new URLSearchParams();
  if (route.entryId) params.set("entry", route.entryId);
  if (route.bookPage !== undefined) params.set("book", String(route.bookPage));
  if (route.focus) params.set("focus", route.focus);
  return `#${route.tab}${params.size ? `?${params}` : ""}`;
}
export function useReferenceNavigation() {
  const [route, setRoute] = useState(() => readRoute(location.hash));
  useEffect(() => {
    history.replaceState(
      {
        ...history.state,
        referenceNavigation: {
          parent: history.state?.referenceNavigation?.parent ?? false,
        },
      },
      "",
      routeHash(readRoute(location.hash)),
    );
    const pop = () => setRoute(readRoute(location.hash));
    window.addEventListener("popstate", pop);
    window.addEventListener("hashchange", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("hashchange", pop);
    };
  }, []);
  const navigate = (next: ReferenceRoute) => {
    if (routeHash(next) === location.hash) return;
    history.pushState(
      { referenceNavigation: { parent: true } },
      "",
      routeHash(next),
    );
    setRoute(next);
  };
  const back = () => {
    if (history.state?.referenceNavigation?.parent) history.back();
    else {
      const next =
        route.bookPage !== undefined && route.entryId
          ? { tab: route.tab, entryId: route.entryId }
          : { tab: route.tab };
      history.replaceState(
        { referenceNavigation: { parent: false } },
        "",
        routeHash(next),
      );
      setRoute(next);
    }
  };
  return {
    route,
    setTab: (tab: Tab) => navigate({ tab }),
    openEntry: (entryId: string) => navigate({ tab: route.tab, entryId }),
    openBook: (page: number, focus?: string) =>
      navigate({ ...route, bookPage: page, focus }),
    back,
  };
}
