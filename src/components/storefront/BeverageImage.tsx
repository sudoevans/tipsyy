"use client";

import Image from "next/image";
import { useState } from "react";

interface BeverageImageProps {
  alt: string;
  className?: string;
  sizes: string;
  src?: string;
}

export default function BeverageImage({ alt, className = "", sizes, src }: BeverageImageProps) {
  const [imageState, setImageState] = useState({ hasError: false, isLoading: Boolean(src), src });
  const isCurrentSource = imageState.src === src;
  const hasError = isCurrentSource && imageState.hasError;
  const isLoading = isCurrentSource ? imageState.isLoading : Boolean(src);

  if (!src || hasError) {
    return <div aria-label={alt || undefined} className="flex h-full w-full items-center justify-center bg-tipsy-surface px-5 text-center text-xs font-medium text-tipsy-muted">{alt ? "No image available" : <span className="size-9 rounded-full border border-tipsy-line" />}</div>;
  }

  return <><div aria-hidden="true" className={`absolute inset-0 animate-pulse bg-tipsy-surface transition-opacity duration-200 ${isLoading ? "opacity-100" : "opacity-0"}`} /><Image alt={alt} className={`${className} transition-opacity duration-200 ${isLoading ? "opacity-0" : "opacity-100"}`} fill onError={() => setImageState({ hasError: true, isLoading: false, src })} onLoad={() => setImageState((current) => current.src === src ? { ...current, isLoading: false } : current)} sizes={sizes} src={src} unoptimized /></>;
}
