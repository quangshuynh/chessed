import Image from "next/image";
import Link from "next/link";

export function BrandLink() {
  return (
    <Link href="/" className="brand-link" aria-label="Chessed home">
      <Image
        src="/brand/chessed-logo.png"
        alt=""
        width={256}
        height={210}
        className="brand-logo"
        priority
      />
      <span>Chessed</span>
    </Link>
  );
}
