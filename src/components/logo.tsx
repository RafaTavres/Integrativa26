import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-[4px]"
      aria-label="Meu Caixa — início"
    >
      <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-terracotta text-cream transition-colors group-hover:bg-terracotta-dark">
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 9.2 12 4l8 5.2v9.1L12 20l-8-1.7V9.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m4.2 9.3 7.8 5.4 7.8-5.4M12 14.7V20"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="display text-[1.35rem] text-ink">Meu Caixa</span>
    </Link>
  );
}
