import Link from "next/link";
import { IMAGES } from "@/assets/images";
import { href } from "@/lib/access";
import { screenTitle } from "@/lib/data";
import { Icon } from "./Icon";

type BtnProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label?: React.ReactNode;
  action?: string;
  kind?: string;
  icon?: string;
};

export function Btn({ label, action, kind = "", icon, type = "button", ...rest }: BtnProps) {
  const fallback = !label && !rest["aria-label"] ? icon || action : undefined;
  return (
    <button type={type} className={`btn ${kind}`} data-action={action} aria-label={fallback} {...rest}>
      {icon && <Icon name={icon} />}
      {label}
    </button>
  );
}

type LinkBtnProps = { label?: React.ReactNode; route: string; kind?: string; icon?: string } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>;

export function LinkBtn({ label, route, kind = "", icon, ...rest }: LinkBtnProps) {
  return (
    <Link className={`btn ${kind}`} href={href(route)} aria-label={!label ? screenTitle(route) || route : undefined} {...rest}>
      {icon && <Icon name={icon} />}
      {label}
    </Link>
  );
}

export function Badge({ label, kind = "", icon }: { label: React.ReactNode; kind?: string; icon?: string }) {
  return (
    <span className={`badge ${kind}`}>
      {icon && <Icon name={icon} />}
      {label}
    </span>
  );
}

export function Circle({ icon, kind = "" }: { icon: string; kind?: string }) {
  return (
    <span className={`circle ${kind}`}>
      <Icon name={icon} />
    </span>
  );
}

export function Avatar({ name, big = false }: { name: string; big?: boolean }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <span className={`avatar ${big ? "big" : ""}`} aria-label={name}>
      {initials}
    </span>
  );
}

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Unstoppable, halaman awal">
      <img className="brand-logo" src={IMAGES.logo} alt="" />
      <div>
        <strong>Unstoppable</strong>
        <small>Sampai dengan Selamat</small>
      </div>
    </Link>
  );
}

type FieldBase = { label: React.ReactNode; name: string };

export function TextField({
  label,
  name,
  value = "",
  placeholder = "",
  type = "text",
  required = false,
  inputProps,
}: FieldBase & {
  value?: string | number;
  placeholder?: string;
  type?: string;
  required?: boolean;
  inputProps?: React.ComponentProps<"input">;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} name={name} defaultValue={value ?? ""} placeholder={placeholder} required={required} {...inputProps} />
    </label>
  );
}

export function SelectField({ label, name, options, value }: FieldBase & { options: (string | [string, string])[]; value?: string }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o]));
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={opts.some(([v]) => v === value) ? value : undefined}>
        {opts.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AreaField({ label, name, placeholder = "" }: FieldBase & { placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea name={name} placeholder={placeholder}></textarea>
    </label>
  );
}

export function EmptyState({ title, text, label, route }: { title: string; text: string; label: string; route: string }) {
  return (
    <div className="empty">
      <Circle icon="map-pin" />
      <h2>{title}</h2>
      <p>{text}</p>
      <LinkBtn label={label} route={route} kind="primary" />
    </div>
  );
}
