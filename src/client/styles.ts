/**
 * The widget's stylesheet, injected once when the plugin loads.
 *
 * Three decisions are load-bearing rather than cosmetic:
 *
 * 1. **The dock is a rounded square, not a circle.** It sits beside the
 *    product's own rounded-rectangle controls and reads as one of them; a
 *    perfect circle would read as a chat head from another application.
 * 2. **The list is a ledger, not a stack of cards.** A hairline spine and one
 *    status dot per row encode chronology and outcome at a glance; giving every
 *    row its own filled card would turn ten finished turns into ten competing
 *    boxes.
 * 3. **Colour comes from the product's tokens.** The widget follows the app into
 *    dark mode and into another accent, and the only literal colours are the
 *    translucent black shadows, which are depth rather than palette.
 *
 * The class prefix is `dtn-`; selectors stay flat and single-class so no two
 * rules can cancel each other out through specificity.
 *
 * @module dsh-task-notice/client/styles
 */

/** Element id marking this plugin's injected style tag. */
export const STYLE_ID = 'dsh-task-notice/styles'

/** The complete stylesheet. */
export const styles = String.raw`
/* ------------------------------------------------------------------ root -- */

.dtn-root {
  position: fixed;
  inset-block-start: 56px;
  inset-block-end: auto;
  inset-inline-end: 16px;
  inline-size: 40px;
  block-size: 40px;
  z-index: 60;
  pointer-events: none;
  font-family: var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
}

.dtn-root > * {
  pointer-events: auto;
}

.dtn-root[data-dragging="true"] {
  user-select: none;
}

/* ------------------------------------------------------------------ dock -- */

.dtn-dock {
  position: relative;
  inline-size: 40px;
  block-size: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 13px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(0 0 0 / 10%);
  color: var(--dsw-alias-label-secondary);
  cursor: grab;
  touch-action: none;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

.dtn-dock:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  transform: translateY(-1px);
}

.dtn-root[data-dragging="true"] .dtn-dock,
.dtn-root[data-dragging="true"] .dtn-dock:hover {
  cursor: grabbing;
  transform: none;
}

.dtn-dock[data-open="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border-color: var(--dsw-alias-border-l3);
}

.dtn-dock[data-decision="true"] {
  border-color: color-mix(in srgb, var(--dsw-static-amber-500) 65%, var(--dsw-alias-border-l2));
  box-shadow: 0 1px 2px rgb(0 0 0 / 6%), 0 8px 24px rgb(199 137 38 / 18%);
}

.dtn-dock[data-fresh="true"] .dtn-dockIcon {
  animation: dtn-swing 620ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
  transform-origin: 50% 12%;
  display: inline-flex;
}

.dtn-dockIcon {
  display: inline-flex;
}

.dtn-badge {
  position: absolute;
  inset-block-start: -4px;
  inset-inline-end: -4px;
  min-inline-size: 18px;
  block-size: 18px;
  padding-inline: 5px;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  border: 1.5px solid var(--dsw-alias-bg-base);
  border-radius: 9px;
  background: var(--dsw-static-deepseek-500);
  color: rgb(255 255 255);
  font-size: 10.5px;
  font-weight: 650;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.dtn-badge[data-tone="decision"] {
  background: var(--dsw-static-amber-500);
  color: #fff;
}

.dtn-live {
  position: absolute;
  inset-block-end: -3px;
  inset-inline-end: -3px;
  inline-size: 10px;
  block-size: 10px;
  box-sizing: border-box;
  border: 1.5px solid var(--dsw-alias-bg-base);
  border-radius: 50%;
  background: var(--dsw-static-deepseek-500);
  animation: dtn-pulse 1.9s ease-in-out infinite;
}

/* ----------------------------------------------------------------- panel -- */

.dtn-panel {
  position: absolute;
  inset-block-start: calc(100% + 10px);
  inset-inline-end: 0;
  inline-size: min(368px, calc(100vw - 24px));
  max-block-size: min(560px, calc(100vh - 104px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 95%, transparent);
  backdrop-filter: blur(20px) saturate(1.15);
  box-shadow: 0 2px 6px rgb(0 0 0 / 6%), 0 20px 52px rgb(0 0 0 / 16%);
  transform-origin: top right;
  animation: dtn-rise 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* The dock can be dragged near an edge; the panel folds to whichever side has
   room. The top/left rules only mirror the anchor, never the dock itself. */
.dtn-root[data-flip="true"] .dtn-panel {
  inset-block-start: auto;
  inset-block-end: calc(100% + 10px);
  transform-origin: bottom right;
}

.dtn-root[data-halign="start"] .dtn-panel {
  inset-inline-end: auto;
  inset-inline-start: 0;
  transform-origin: top left;
}

.dtn-root[data-halign="start"][data-flip="true"] .dtn-panel {
  transform-origin: bottom left;
}

.dtn-head {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 13px 10px 9px 14px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.dtn-root[data-dragging="true"] .dtn-head {
  cursor: grabbing;
}

.dtn-headText {
  flex: 1;
  min-inline-size: 0;
  padding-inline-start: 2px;
}

.dtn-title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.dtn-sub {
  margin: 3px 0 0;
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-sub[data-tone="unread"] {
  color: var(--dsw-static-deepseek-500);
  font-weight: 550;
}

.dtn-sub[data-tone="decision"] {
  color: color-mix(in srgb, var(--dsw-static-amber-500) 72%, var(--dsw-alias-label-primary));
  font-weight: 600;
}

.dtn-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: none;
}

.dtn-iconBtn {
  inline-size: 26px;
  block-size: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease;
}

.dtn-iconBtn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dtn-markRead {
  flex: none;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-static-deepseek-500);
  font: inherit;
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.dtn-markRead:hover {
  background: color-mix(in srgb, var(--dsw-static-deepseek-500) 9%, transparent);
}

/* ---------------------------------------------------------------- running -- */

.dtn-running {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 10px 7px;
  padding: 7px 9px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--dsw-static-deepseek-500) 7%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 11.5px;
}

.dtn-runningDot {
  inline-size: 6px;
  block-size: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-static-deepseek-500);
  animation: dtn-pulse 1.8s ease-in-out infinite;
}

.dtn-runningText {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* -------------------------------------------------------------- decisions -- */

.dtn-decisions {
  flex: none;
  max-block-size: 236px;
  margin: 0 10px 8px;
  overflow: auto;
  overscroll-behavior: contain;
  border: 0.5px solid color-mix(in srgb, var(--dsw-static-amber-500) 36%, var(--dsw-alias-border-l2));
  border-radius: 11px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--dsw-static-amber-500) 8%, transparent), transparent 72%),
    var(--dsw-alias-bg-layer-1);
}

.dtn-decisionHead {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px 6px;
  color: color-mix(in srgb, var(--dsw-static-amber-500) 70%, var(--dsw-alias-label-primary));
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.dtn-decisionMark {
  display: grid;
  place-items: center;
  inline-size: 15px;
  block-size: 15px;
  border-radius: 50%;
  background: var(--dsw-static-amber-500);
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

.dtn-decisionCount {
  margin-inline-start: auto;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
  font-size: 10px;
}

.dtn-decisionRow {
  display: flex;
  flex-direction: column;
  gap: 3px;
  inline-size: 100%;
  box-sizing: border-box;
  padding: 8px 10px 9px;
  border: 0;
  border-block-start: 0.5px solid var(--dsw-alias-border-l1);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.dtn-decisionRow:hover {
  background: color-mix(in srgb, var(--dsw-static-amber-500) 7%, transparent);
}

.dtn-decisionTop {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-inline-size: 0;
}

.dtn-decisionProject {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: color-mix(in srgb, var(--dsw-static-amber-500) 62%, var(--dsw-alias-label-primary));
  font-size: 10.5px;
  font-weight: 650;
}

.dtn-decisionTime {
  flex: none;
  margin-inline-start: auto;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.dtn-decisionQuestion {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.dtn-decisionOptions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dtn-decisionOptions span {
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 6px;
  border: 0.5px solid color-mix(in srgb, var(--dsw-static-amber-500) 22%, var(--dsw-alias-border-l2));
  border-radius: 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 9.5px;
}

.dtn-decisionFoot {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-block-start: 1px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 9.5px;
}

.dtn-decisionOpen {
  flex: none;
  margin-inline-start: auto;
  color: color-mix(in srgb, var(--dsw-static-amber-500) 70%, var(--dsw-alias-label-primary));
  font-weight: 600;
}

/* ------------------------------------------------------------------- list -- */

.dtn-list {
  flex: 1;
  min-block-size: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 6px 6px;
}

.dtn-day {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  padding: 7px 8px 3px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10.5px;
  font-weight: 550;
  letter-spacing: 0.02em;
}

.dtn-item {
  position: relative;
  inline-size: 100%;
  display: grid;
  grid-template-columns: 38px 12px minmax(0, 1fr);
  column-gap: 9px;
  box-sizing: border-box;
  padding: 7px 8px 8px 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.dtn-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dtn-item[data-unread="true"] {
  background: color-mix(in srgb, var(--dsw-static-deepseek-500) 5%, transparent);
}

.dtn-item[data-unread="true"]:hover {
  background: color-mix(in srgb, var(--dsw-static-deepseek-500) 8%, transparent);
}

.dtn-time {
  padding-block-start: 2px;
  font-family: var(--ds-font-family-code);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: end;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-item[data-unread="true"] .dtn-time {
  color: var(--dsw-static-deepseek-500);
  font-weight: 600;
}

.dtn-spine {
  position: relative;
  display: flex;
  justify-content: center;
}

.dtn-spine::before {
  content: "";
  position: absolute;
  inset-block: -8px;
  inline-size: 1px;
  background: var(--dsw-alias-border-l2);
}

.dtn-day + .dtn-item .dtn-spine::before,
.dtn-item:first-child .dtn-spine::before {
  inset-block-start: 8px;
}

.dtn-dot {
  position: relative;
  z-index: 1;
  inline-size: 10px;
  block-size: 10px;
  margin-block-start: 3px;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--dsw-static-green-500);
  color: rgb(255 255 255);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1);
}

.dtn-dot[data-status="failed"] {
  background: var(--dsw-static-red-500);
}

.dtn-dot[data-status="stopped"] {
  background: var(--dsw-static-amber-500);
}

.dtn-dot[data-status="blocked"] {
  background: var(--dsw-alias-label-tertiary);
}

.dtn-item[data-unread="false"] .dtn-dot {
  inline-size: 8px;
  block-size: 8px;
  margin-block-start: 4px;
  color: transparent;
  opacity: 0.55;
}

.dtn-body {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dtn-meta {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-inline-size: 0;
}

.dtn-project {
  flex: none;
  max-inline-size: 44%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}

.dtn-separator {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}

.dtn-session {
  flex: 1;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-prompt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}

.dtn-item[data-unread="false"] .dtn-prompt {
  color: var(--dsw-alias-label-secondary);
}

.dtn-statusRow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-inline-size: 0;
  margin-block-start: 1px;
}

.dtn-status {
  flex: none;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-status[data-status="done"] {
  color: color-mix(in srgb, var(--dsw-static-green-500) 45%, var(--dsw-alias-label-primary));
}

.dtn-status[data-status="failed"] {
  color: color-mix(in srgb, var(--dsw-static-red-500) 55%, var(--dsw-alias-label-primary));
}

.dtn-status[data-status="stopped"] {
  color: color-mix(in srgb, var(--dsw-static-amber-500) 45%, var(--dsw-alias-label-primary));
}

.dtn-detail {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-duration {
  flex: none;
  margin-inline-start: auto;
  padding-inline-start: 6px;
  font-family: var(--ds-font-family-code);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}

/* ------------------------------------------------------------------ empty -- */

.dtn-empty {
  padding: 30px 26px 30px;
  text-align: center;
}

.dtn-emptyIcon {
  inline-size: 44px;
  block-size: 44px;
  margin: 0 auto 12px;
  display: grid;
  place-items: center;
  border: 0.5px dashed var(--dsw-alias-border-l3);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
}

.dtn-emptyTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.dtn-emptyBody {
  margin: 5px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--dsw-alias-label-tertiary);
}

/* ------------------------------------------------------------------ error -- */

.dtn-error {
  margin: 0 10px 7px;
  padding: 6px 9px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-static-red-500) 7%, transparent);
  color: color-mix(in srgb, var(--dsw-static-red-500) 65%, var(--dsw-alias-label-primary));
  font-size: 10.5px;
}

/* ----------------------------------------------------------------- footer -- */

.dtn-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px 8px;
  border-block-start: 0.5px solid var(--dsw-alias-border-l1);
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-footNote {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dtn-linkBtn {
  flex: none;
  padding: 3px 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.dtn-linkBtn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dtn-linkBtn[data-danger="true"] {
  color: color-mix(in srgb, var(--dsw-static-red-500) 65%, var(--dsw-alias-label-primary));
}

/* ------------------------------------------------------------------ cards -- */

.dtn-cards {
  position: absolute;
  inset-block-start: calc(100% + 10px);
  inset-inline-end: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.dtn-root[data-flip="true"] .dtn-cards {
  inset-block-start: auto;
  inset-block-end: calc(100% + 10px);
  flex-direction: column-reverse;
}

.dtn-root[data-halign="start"] .dtn-cards {
  inset-inline-end: auto;
  inset-inline-start: 0;
  align-items: flex-start;
}

.dtn-card {
  position: relative;
  inline-size: min(342px, calc(100vw - 40px));
  box-sizing: border-box;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 13px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 94%, transparent);
  backdrop-filter: blur(16px) saturate(1.15);
  box-shadow: 0 2px 6px rgb(0 0 0 / 6%), 0 14px 36px rgb(0 0 0 / 14%);
  cursor: pointer;
  animation: dtn-slide 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.dtn-cardMain {
  display: block;
  inline-size: 100%;
  box-sizing: border-box;
  padding: 10px 32px 10px 13px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.dtn-root[data-halign="start"] .dtn-card {
  animation-name: dtn-slide-left;
}

.dtn-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgb(0 0 0 / 7%), 0 18px 42px rgb(0 0 0 / 17%);
}

.dtn-root[data-dragging="true"] .dtn-card,
.dtn-root[data-dragging="true"] .dtn-card:hover {
  transform: none;
  animation: none;
}

.dtn-card::before {
  content: "";
  position: absolute;
  inset-block: 10px;
  inset-inline-start: 0;
  inline-size: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--dtn-status, var(--dsw-static-green-500));
}

.dtn-card[data-status="failed"] { --dtn-status: var(--dsw-static-red-500); }
.dtn-card[data-status="stopped"] { --dtn-status: var(--dsw-static-amber-500); }
.dtn-card[data-status="blocked"] { --dtn-status: var(--dsw-alias-label-tertiary); }
.dtn-card[data-status="decision"] { --dtn-status: var(--dsw-static-amber-500); }

.dtn-cardTop {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-inline-size: 0;
}

.dtn-cardKind {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  color: color-mix(in srgb, var(--dsw-static-green-500) 45%, var(--dsw-alias-label-primary));
}

.dtn-card[data-status="failed"] .dtn-cardKind {
  color: color-mix(in srgb, var(--dsw-static-red-500) 55%, var(--dsw-alias-label-primary));
}

.dtn-card[data-status="stopped"] .dtn-cardKind {
  color: color-mix(in srgb, var(--dsw-static-amber-500) 45%, var(--dsw-alias-label-primary));
}

.dtn-card[data-status="blocked"] .dtn-cardKind {
  color: var(--dsw-alias-label-tertiary);
}

.dtn-card[data-status="decision"] .dtn-cardKind {
  color: color-mix(in srgb, var(--dsw-static-amber-500) 70%, var(--dsw-alias-label-primary));
}

.dtn-cardProject {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-cardTime {
  flex: none;
  margin-inline-start: auto;
  font-family: var(--ds-font-family-code);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-cardPrompt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-block-start: 3px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}

.dtn-cardSession {
  margin-block-start: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-cardOptions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-block-start: 5px;
}

.dtn-cardOptions span {
  max-inline-size: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 7px;
  border: 0.5px solid color-mix(in srgb, var(--dsw-static-amber-500) 24%, var(--dsw-alias-border-l2));
  border-radius: 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 9.5px;
}

.dtn-cardClose {
  position: absolute;
  inset-block-start: 6px;
  inset-inline-end: 6px;
  inline-size: 20px;
  block-size: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease;
}

.dtn-card:hover .dtn-cardClose,
.dtn-cardClose:focus-visible {
  opacity: 1;
}

.dtn-cardClose:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* --------------------------------------------------------------- settings -- */

.dtn-settings {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 4px 15px 17px;
  overflow: auto;
}

.dtn-setting {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.dtn-settingText {
  min-inline-size: 0;
}

.dtn-settingLabel {
  font-size: 12.5px;
  font-weight: 550;
  line-height: 1.35;
}

.dtn-settingHint {
  margin-block-start: 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}

.dtn-switch {
  position: relative;
  flex: none;
  inline-size: 32px;
  block-size: 18px;
  margin-block-start: 1px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: var(--dsw-alias-border-l4);
  cursor: pointer;
  transition: background 160ms ease;
}

.dtn-switch[aria-checked="true"] {
  background: var(--dsw-static-deepseek-500);
}

.dtn-switch::after {
  content: "";
  position: absolute;
  inset-block-start: 2px;
  inset-inline-start: 2px;
  inline-size: 14px;
  block-size: 14px;
  border-radius: 50%;
  background: rgb(255 255 255);
  box-shadow: 0 1px 2px rgb(0 0 0 / 22%);
  transition: transform 160ms ease;
}

.dtn-switch[aria-checked="true"]::after {
  transform: translateX(14px);
}

.dtn-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-start: 7px;
}

.dtn-range {
  flex: 1;
  min-inline-size: 0;
  accent-color: var(--dsw-static-deepseek-500);
}

.dtn-testBtn {
  flex: none;
  padding: 3px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.dtn-testBtn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dtn-testBtn:disabled {
  cursor: default;
  opacity: 0.45;
}

.dtn-testBtn:disabled:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}

.dtn-panel .dtn-inlineNote {
  margin: 0 10px 7px;
}

.dtn-inlineNote {
  margin-block-start: 9px;
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10.5px;
  line-height: 1.5;
}

.dtn-inlineNote[data-tone="error"] {
  color: color-mix(in srgb, var(--dsw-static-red-500) 65%, var(--dsw-alias-label-primary));
  background: color-mix(in srgb, var(--dsw-static-red-500) 7%, transparent);
}

/* --------------------------------------------------------------- keyframes -- */

@keyframes dtn-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
}

@keyframes dtn-swing {
  0% { transform: rotate(0deg); }
  18% { transform: rotate(13deg); }
  38% { transform: rotate(-10deg); }
  58% { transform: rotate(6deg); }
  78% { transform: rotate(-3deg); }
  100% { transform: rotate(0deg); }
}

@keyframes dtn-rise {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes dtn-slide {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes dtn-slide-left {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}

/* --------------------------------------------------------------- a11y/motion -- */

.dtn-dock:focus-visible,
.dtn-iconBtn:focus-visible,
.dtn-markRead:focus-visible,
.dtn-item:focus-visible,
.dtn-decisionRow:focus-visible,
.dtn-card:focus-visible,
.dtn-cardClose:focus-visible,
.dtn-linkBtn:focus-visible,
.dtn-switch:focus-visible,
.dtn-testBtn:focus-visible,
.dtn-range:focus-visible {
  outline: 2px solid var(--dsw-static-deepseek-500);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .dtn-dock,
  .dtn-card,
  .dtn-switch,
  .dtn-switch::after,
  .dtn-iconBtn {
    transition: none;
  }
  .dtn-dock[data-fresh="true"] .dtn-dockIcon,
  .dtn-live,
  .dtn-runningDot,
  .dtn-panel,
  .dtn-card {
    animation: none;
  }
}

@media (max-width: 520px) {
  .dtn-root {
    inset-block-start: 12px;
    inset-inline-end: 12px;
  }
}
`
