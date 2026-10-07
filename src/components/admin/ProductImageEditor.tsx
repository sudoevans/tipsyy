"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Edit01Icon,
  Image01Icon,
  AlertCircleIcon,
  Link01Icon,
  Trash01Icon,
  UploadCloud01Icon,
  XCloseIcon,
} from "@untitledui/icons-react/outline";
import { updateProductImage } from "@/app/[locale]/(admin)/admin/actions";
import { useAdminToast } from "@/components/admin/AdminToast";

type Props = {
  productId: string;
  productName: string;
  imageUrl: string | null;
};

export default function ProductImageEditor({
  productId,
  productName,
  imageUrl,
}: Props) {
  const router = useRouter();
  const { showToast } = useAdminToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [currentImage, setCurrentImage] = useState(imageUrl);
  const [draftImage, setDraftImage] = useState(imageUrl ?? "");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  useEffect(() => setCurrentImage(imageUrl), [imageUrl]);

  const beginEdit = () => {
    setDraftImage(currentImage ?? "");
    setUrl("");
    setError("");
    setOpen(true);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/v1/admin/uploads/product-image", {
        method: "POST",
        body,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error?.message ?? "Image upload failed.");
      setDraftImage(payload.data.url);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const previewUrl = async () => {
    setError("");
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("Enter a valid http or https image URL.");
      return;
    }
    setRetrieving(true);
    try {
      const response = await fetch(
        "/api/v1/admin/uploads/product-image/from-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message ?? "We could not retrieve that image.",
        );
      setDraftImage(payload.data.url);
    } catch (retrieveError) {
      setError(
        retrieveError instanceof Error
          ? retrieveError.message
          : "We could not retrieve that image.",
      );
    } finally {
      setRetrieving(false);
    }
  };

  const save = () =>
    startSaving(async () => {
      try {
        await updateProductImage(productId, draftImage || null);
        setCurrentImage(draftImage || null);
        setOpen(false);
        showToast({ title: "Product image updated", tone: "success" });
        router.refresh();
      } catch (saveError) {
        showToast({
          title: "Could not save image",
          description:
            saveError instanceof Error ? saveError.message : "Try again.",
          tone: "error",
        });
      }
    });

  const remove = () => {
    startSaving(async () => {
      try {
        await updateProductImage(productId, null);
        setCurrentImage(null);
        setDraftImage("");
        setRemoveOpen(false);
        showToast({ title: "Product image removed", tone: "success" });
        router.refresh();
      } catch (removeError) {
        showToast({
          title: "Could not remove image",
          description:
            removeError instanceof Error ? removeError.message : "Try again.",
          tone: "error",
        });
      }
    });
  };

  return (
    <>
      <div className="flex h-full w-full flex-1 flex-col self-stretch">
        <div className="relative h-[300px] w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          {currentImage ? (
            <img
              src={currentImage}
              alt={productName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <Image01Icon className="size-9" />
              <span className="text-sm">No product image</span>
            </div>
          )}
          <span className="absolute top-3 left-3 rounded-md bg-white/95 px-2 py-1 text-xs font-semibold text-gray-700 shadow-sm">
            Main image
          </span>
          <button
            type="button"
            onClick={beginEdit}
            className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
            aria-label={
              currentImage ? "Update product image" : "Upload product image"
            }
          >
            <Edit01Icon className="size-4" />
          </button>
        </div>
        <div className="mt-auto flex items-start gap-3 rounded-lg bg-warning-50 px-3 py-3 text-sm text-gray-600 dark:bg-warning-500/10 dark:text-gray-300">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-warning-500 text-white shadow-theme-xs">
            <AlertCircleIcon className="size-4" />
          </span>
          <p className="leading-5">
            <span className="block font-semibold text-gray-800 dark:text-white">
              Image requirements
            </span>
            JPG, PNG or WebP, up to 5 MB. A landscape image works best for a
            clear product preview.
          </p>
        </div>
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center bg-gray-950/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-product-image-title"
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-theme-xl sm:rounded-2xl dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="update-product-image-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Update product image
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Choose one JPG, PNG, or WebP image.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <XCloseIcon className="size-5" />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || retrieving}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-gray-100 text-gray-600">
                  <UploadCloud01Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-800">
                    {uploading ? "Uploading…" : "Upload image"}
                  </span>
                  <span className="block text-xs text-gray-500">
                    Max 5 MB · JPG, PNG or WebP
                  </span>
                </span>
              </button>
              <input
                ref={fileInput}
                onChange={(event) => upload(event.target.files?.[0])}
                accept="image/jpeg,image/png,image/webp"
                type="file"
                className="sr-only"
              />
              <div className="relative">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Link01Icon className="size-4" />
                  Or retrieve from an image URL
                </div>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="field h-10"
                  />
                  <button
                    type="button"
                    onClick={previewUrl}
                    disabled={retrieving || !url.trim()}
                    className="h-10 shrink-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
                  >
                    {retrieving ? "Loading…" : "Preview"}
                  </button>
                </div>
              </div>
              {error ? (
                <p
                  className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              {draftImage ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  <img
                    src={draftImage}
                    alt="New product preview"
                    className="h-44 w-full object-cover"
                  />
                  <p className="px-3 py-2 text-xs text-gray-500">
                    Preview — save to apply this image.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex items-center gap-2 border-t border-gray-100 pt-4">
              {currentImage ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setRemoveOpen(true);
                  }}
                  disabled={saving}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-error-600 hover:bg-error-50 disabled:opacity-50"
                >
                  <Trash01Icon className="size-4" />
                  Remove
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto h-10 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !draftImage}
                className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save image"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {removeOpen ? (
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-gray-950/40 p-0 sm:items-center sm:p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="remove-product-image-title"
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-theme-xl sm:rounded-2xl dark:bg-gray-900">
            <div className="flex size-10 items-center justify-center rounded-full bg-error-50 text-error-600">
              <Trash01Icon className="size-5" />
            </div>
            <h2
              id="remove-product-image-title"
              className="mt-4 text-lg font-semibold text-gray-900 dark:text-white"
            >
              Remove product image?
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-gray-500">
              The product will use an empty-image placeholder until a new image
              is saved.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveOpen(false)}
                disabled={saving}
                className="h-10 rounded-lg px-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-error-600 px-4 text-sm font-semibold text-white hover:bg-error-700 disabled:opacity-50"
              >
                <Trash01Icon className="size-4" />
                {saving ? "Removing…" : "Remove image"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
