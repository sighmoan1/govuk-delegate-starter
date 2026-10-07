"use client";
import { useFormStatus } from "react-dom";

/** Keeps the button focusable while the agent works, and says so. */
export function SubmitButton({ children, className = "xai-button", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button className={className} type="submit" name={name} value={value} aria-disabled={pending || undefined} onClick={(e) => pending && e.preventDefault()}>
        {children}
      </button>
      {pending && name === undefined && <span className="visually-hidden" role="status">The assistant is working…</span>}
    </>
  );
}
