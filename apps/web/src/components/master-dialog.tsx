"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal built on <dialog>.
 *
 * The native element brings focus trapping, Escape-to-close, inert background
 * content and the top layer for free — all of which a div-based modal has to
 * reimplement, and usually only partly. showModal() is called from an effect
 * because it is imperative and React does not model the open state as an
 * attribute.
 */
export function MasterDialog({
  open,
  title,
  description,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** For forms with more than two columns of fields. */
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop closes it. The backdrop is the dialog element
      // itself outside its content box, so the target check is what separates
      // "clicked outside" from "clicked a control inside".
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      // m-auto is not decoration: a native <dialog> is centred by its UA
      // `margin: auto`, which Tailwind's preflight resets to 0 — leaving every
      // modal pinned to the top-left corner.
      className={`card m-auto w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl p-0 text-fg backdrop:bg-slate-950/60`}
    >
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
