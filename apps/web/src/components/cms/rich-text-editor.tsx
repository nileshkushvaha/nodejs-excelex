"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

import { EditorToolbar } from "./editor-toolbar";
import { MediaPicker } from "./media-picker";

/**
 * The body editor: TipTap over ProseMirror, with an escape hatch to raw HTML.
 *
 * The value that leaves this component is HTML, because HTML is what the API
 * stores, sanitises and serves — a JSON document would need a renderer on the
 * public site and a migration the day the schema changed. The HTML toggle is
 * there for the person who knows exactly which markup they want and does not
 * want a WYSIWYG guessing; switching back re-parses through the same schema,
 * so anything the editor cannot represent is dropped visibly rather than
 * silently on save.
 *
 * `immediatelyRender: false` because this renders inside a server-rendered
 * page: the editor must not try to build a DOM during SSR.
 */
export function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder = "Start writing…",
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [source, setSource] = useState(false);
  const [draftHtml, setDraftHtml] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  // What we last told the parent, so a prop echoing it back is not a reset.
  const lastEmitted = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener" } },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "cms-editor-body", "aria-label": "Body" },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // A change from outside — a revision restore, a reload after save — lands
  // in the editor without a remount, and without echoing back as an edit.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
    setDraftHtml(value);
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  function toggleSource() {
    if (!editor) return;
    if (source) {
      // Leaving the HTML view: what was typed becomes the document, and the
      // document's own serialisation becomes the value — so what is saved is
      // what the editor will show next time, not something it might not parse.
      editor.commands.setContent(draftHtml, { emitUpdate: false });
      const html = editor.getHTML();
      lastEmitted.current = html;
      onChange(html);
      setSource(false);
    } else {
      setDraftHtml(editor.getHTML());
      setSource(true);
    }
  }

  return (
    <div className={`cms-editor card overflow-hidden rounded-xl ${disabled ? "opacity-70" : ""}`}>
      <EditorToolbar
        editor={editor}
        source={source}
        onToggleSource={toggleSource}
        onPickImage={() => setPickerOpen(true)}
        disabled={disabled}
      />

      {source ? (
        <textarea
          value={draftHtml}
          onChange={(event) => {
            setDraftHtml(event.target.value);
            lastEmitted.current = event.target.value;
            onChange(event.target.value);
          }}
          disabled={disabled}
          spellCheck={false}
          aria-label="HTML source"
          className="block min-h-[28rem] w-full resize-y bg-surface p-4 font-mono text-xs leading-relaxed text-fg outline-none"
        />
      ) : (
        <EditorContent editor={editor} />
      )}

      <MediaPicker
        open={pickerOpen}
        accept="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => {
          setPickerOpen(false);
          editor
            ?.chain()
            .focus()
            .setImage({ src: media.url, alt: media.altText ?? "", title: media.fileName })
            .run();
        }}
      />
    </div>
  );
}
