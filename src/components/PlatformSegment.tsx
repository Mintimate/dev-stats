import type { ManualConfig } from "../lib/types";

/**
 * 平台切换分段控件，被 AgentPanel 与 ManualOptions 共用。
 */
export function PlatformSegment({
  platform,
  disabled,
  ariaLabel = "目标平台",
  onChange,
}: {
  platform: ManualConfig["platform"];
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (platform: ManualConfig["platform"]) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      <button type="button" data-platform="github" disabled={disabled} aria-pressed={platform === "github"} className={platform === "github" ? "active" : ""} onClick={() => onChange("github")}>
        GitHub
      </button>
      <button type="button" data-platform="cnb" disabled={disabled} aria-pressed={platform === "cnb"} className={platform === "cnb" ? "active" : ""} onClick={() => onChange("cnb")}>
        CNB
      </button>
    </div>
  );
}
