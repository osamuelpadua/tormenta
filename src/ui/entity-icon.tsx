import artwork from "./entity-art.json";
import equipment from "../data/equipment.json" with { type: "json" };

const art: Record<string, string> = artwork;
export const entityName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const names = Object.keys(art).sort((a, b) => b.length - a.length);
const equipmentNames = equipment
  .map((item) => entityName(item.name))
  .sort((a, b) => b.length - a.length);
export function entityArtwork(name: string) {
  const key = entityName(name);
  if (art[key]) return art[key];
  // Custom equipment keeps the most specific named identity (e.g. Marreta certeira).
  const matches = (candidate: string) => ` ${key} `.includes(` ${candidate} `);
  const known = equipmentNames.find(matches) ?? names.find(matches);
  return known ? art[known] : undefined;
}
export function EntityIcon({
  name,
  size = 30,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const icon = entityArtwork(name);
  return (
    <span
      className={`entity-icon ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      data-art={icon ?? "personalized"}
    >
      {icon ? (
        <svg viewBox="0 0 512 512" width={size} height={size} focusable="false">
          <use href={`/art/entity-icons.svg#${icon}`} />
        </svg>
      ) : (
        <span className="entity-sigil">
          {name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .slice(0, 2)
            .join("") || "◇"}
        </span>
      )}
    </span>
  );
}
