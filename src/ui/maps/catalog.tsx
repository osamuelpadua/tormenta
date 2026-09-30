import categories from "../../data/map-categories.json";

export const MAP_CATEGORIES = categories;
export const MAP_ICONS = categories.map((category) => ({
  id: category.iconId,
  name: category.name,
}));
export const categoryName = (id: string) =>
  categories.find((category) => category.id === id)?.name ?? "Outro local";
export const mapIconId = (id: string) =>
  MAP_ICONS.some((icon) => icon.id === id) ? id : "position-marker";
export function MapIcon({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`/art/entity-icons.svg#${mapIconId(id)}`} />
    </svg>
  );
}
