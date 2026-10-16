import { ICONS } from "./icons.data";

export function Icon({ name }: { name: string }) {
  const node = ICONS[name];
  if (!node) {
    if (process.env.NODE_ENV !== "production") console.warn(`Icon "${name}" is not in icons.data.ts`);
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-lucide={name}
      aria-hidden="true"
      className={`lucide lucide-${name} icon`}
    >
      {node.map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...attrs} />;
      })}
    </svg>
  );
}

export function iconMarkup(name: string) {
  const node = ICONS[name] || [];
  const children = node
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}></${tag}>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="${name}" aria-hidden="true" class="lucide lucide-${name} icon">${children}</svg>`;
}
