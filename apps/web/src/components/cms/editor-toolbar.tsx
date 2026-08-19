"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useState, type ReactNode } from "react";

/**
 * The row of buttons above the body.
 *
 * Reads the editor through `useEditorState` with a selector, so the toolbar
 * re-renders when a mark toggles under the cursor and the editor itself does
 * not re-render on every keystroke — that is the whole point of turning
 * `shouldRerenderOnTransaction` off in the parent.
 *
 * Text labels rather than an icon set: the app inlines a dozen SVGs by hand
 * and a toolbar would double that. Short labels are legible, and the title
 * attribute carries the long form and the shortcut.
 */
export function EditorToolbar({
  editor,
  source,
  onToggleSource,
  onPickImage,
  disabled,
}: {
  editor: Editor | null;
  source: boolean;
  onToggleSource: () => void;
  onPickImage: () => void;
  disabled?: boolean;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            h2: instance.isActive("heading", { level: 2 }),
            h3: instance.isActive("heading", { level: 3 }),
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            underline: instance.isActive("underline"),
            strike: instance.isActive("strike"),
            bullet: instance.isActive("bulletList"),
            ordered: instance.isActive("orderedList"),
            quote: instance.isActive("blockquote"),
            code: instance.isActive("codeBlock"),
            link: instance.isActive("link"),
            table: instance.isActive("table"),
            left: instance.isActive({ textAlign: "left" }),
            center: instance.isActive({ textAlign: "center" }),
            right: instance.isActive({ textAlign: "right" }),
            canUndo: instance.can().undo(),
            canRedo: instance.can().redo(),
            linkHref: (instance.getAttributes("link").href as string | undefined) ?? "",
          }
        : null,
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");

  const off = disabled || source || !editor;

  function openLink() {
    setLinkHref(state?.linkHref ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const href = linkHref.trim();
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  return (
    <div className="border-b border-line bg-surface-2">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <Group>
          <Btn title="Heading 2" active={state?.h2} disabled={off} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </Btn>
          <Btn title="Heading 3" active={state?.h3} disabled={off} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
            H3
          </Btn>
          <Btn title="Paragraph" disabled={off} onClick={() => editor?.chain().focus().setParagraph().run()}>
            ¶
          </Btn>
        </Group>
        <Group>
          <Btn title="Bold (Ctrl+B)" active={state?.bold} disabled={off} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <b>B</b>
          </Btn>
          <Btn title="Italic (Ctrl+I)" active={state?.italic} disabled={off} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </Btn>
          <Btn title="Underline (Ctrl+U)" active={state?.underline} disabled={off} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <u>U</u>
          </Btn>
          <Btn title="Strikethrough" active={state?.strike} disabled={off} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </Btn>
        </Group>
        <Group>
          <Btn title="Bulleted list" active={state?.bullet} disabled={off} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            • List
          </Btn>
          <Btn title="Numbered list" active={state?.ordered} disabled={off} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            1. List
          </Btn>
          <Btn title="Quote" active={state?.quote} disabled={off} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            “ ”
          </Btn>
          <Btn title="Code block" active={state?.code} disabled={off} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            {"</>"}
          </Btn>
        </Group>
        <Group>
          <Btn title="Link" active={state?.link} disabled={off} onClick={openLink}>
            Link
          </Btn>
          <Btn title="Insert image from the media library" disabled={off} onClick={onPickImage}>
            Image
          </Btn>
          <Btn
            title="Insert table"
            active={state?.table}
            disabled={off}
            onClick={() =>
              state?.table
                ? editor?.chain().focus().deleteTable().run()
                : editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            {state?.table ? "Remove table" : "Table"}
          </Btn>
          {state?.table ? (
            <>
              <Btn title="Add row below" disabled={off} onClick={() => editor?.chain().focus().addRowAfter().run()}>
                +Row
              </Btn>
              <Btn title="Add column after" disabled={off} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                +Col
              </Btn>
              <Btn title="Delete row" disabled={off} onClick={() => editor?.chain().focus().deleteRow().run()}>
                −Row
              </Btn>
              <Btn title="Delete column" disabled={off} onClick={() => editor?.chain().focus().deleteColumn().run()}>
                −Col
              </Btn>
            </>
          ) : null}
        </Group>
        <Group>
          <Btn title="Align left" active={state?.left} disabled={off} onClick={() => editor?.chain().focus().setTextAlign("left").run()}>
            ⇤
          </Btn>
          <Btn title="Align centre" active={state?.center} disabled={off} onClick={() => editor?.chain().focus().setTextAlign("center").run()}>
            ↔
          </Btn>
          <Btn title="Align right" active={state?.right} disabled={off} onClick={() => editor?.chain().focus().setTextAlign("right").run()}>
            ⇥
          </Btn>
        </Group>
        <Group>
          <Btn title="Undo (Ctrl+Z)" disabled={off || !state?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
            ↶
          </Btn>
          <Btn title="Redo (Ctrl+Shift+Z)" disabled={off || !state?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
            ↷
          </Btn>
        </Group>

        <span className="ml-auto" />
        <Btn title={source ? "Back to the visual editor" : "Edit the HTML source"} active={source} disabled={disabled || !editor} onClick={onToggleSource}>
          HTML
        </Btn>
      </div>

      {linkOpen ? (
        <form
          className="flex flex-wrap items-center gap-2 border-t border-line-soft px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <label className="text-xs text-muted" htmlFor="cms-link-href">
            Link to
          </label>
          <input
            id="cms-link-href"
            autoFocus
            value={linkHref}
            onChange={(event) => setLinkHref(event.target.value)}
            placeholder="https://… or /a-page"
            className="min-w-64 flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <button type="submit" className="btn-primary rounded px-2.5 py-1 text-xs font-medium">
            {linkHref.trim() ? "Apply" : "Remove link"}
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="text-xs text-muted hover:text-fg">
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-0.5 border-r border-line-soft pr-1.5 mr-1 last:border-0">{children}</span>;
}

function Btn({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // onMouseDown preventDefault keeps the selection in the editor; a click
      // that steals focus would apply the mark to nothing.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
        active ? "bg-accent text-accent-fg" : "text-fg hover:bg-surface-3"
      }`}
    >
      {children}
    </button>
  );
}
