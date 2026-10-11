import Image from "next/image";

export default function BrandLogo({ className = "h-14 w-24", preload = false }: { className?: string; preload?: boolean }) {
  return <Image alt="Tipsy Theoryy" className={`shrink-0 object-contain ${className}`} height={292} preload={preload} src="/images/logo/tipsyy-logo.svg" unoptimized width={505} />;
}
