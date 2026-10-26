import Image from "next/image";

export function PsCafeLogo({ className = "h-8 w-14" }: { className?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-md bg-white p-1 ${className}`}>
    <Image src="/brands/ps-cafe-logo.webp" alt="PS.Cafe" width={48} height={24} className="h-auto w-full object-contain brightness-0"/>
  </span>;
}
