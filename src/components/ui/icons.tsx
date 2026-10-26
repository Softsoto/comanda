import type { SVGProps } from "react";

/** Iconos de trazo de 24px. Toman el color del texto que los rodea. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
);

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const ArrowUpIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ArrowDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const ExternalIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M14 5h5v5M19 5l-8 8M11 6H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4" />
  </Icon>
);

export const SendIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3z" />
  </Icon>
);

export const PauseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M9 5v14M15 5v14" />
  </Icon>
);

export const PlayIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M7 4.5v15l12-7.5-12-7.5z" />
  </Icon>
);

export const ChevronLeftIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const PrintIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" />
  </Icon>
);

export const DownloadIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
  </Icon>
);

/** Marca de la app: una rejilla de nueve puntos sobre un cuadrado redondeado. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      {[9, 16, 23].flatMap((cy) =>
        [9, 16, 23].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.3" fill="var(--on-brand)" />),
      )}
    </svg>
  );
}
