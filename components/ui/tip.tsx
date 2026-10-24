// The tooltip of an icon-only control (docs/design/README.md, Icons). The control carries the same
// words as its accessible name, so the tooltip is hidden from assistive technology. Its parent must be
// positioned (`relative`).
export type TipAlign = "center" | "start" | "end";
export type TipSide = "bottom" | "top";

export function Tip({ label, align = "center", side = "bottom" }: { label: string; align?: TipAlign; side?: TipSide }) {
  return (
    <span aria-hidden="true" className="tip" data-align={align === "center" ? undefined : align} data-side={side === "bottom" ? undefined : side}>
      {label}
    </span>
  );
}

/** Hides tooltips on Escape until the pointer enters another element or focus moves (WCAG 1.4.13). */
export const TOOLTIP_SCRIPT = `addEventListener("keydown",function(e){if(e.key==="Escape")document.documentElement.dataset.tips="off"});["pointerover","focusin"].forEach(function(t){addEventListener(t,function(){delete document.documentElement.dataset.tips},true)})`;
