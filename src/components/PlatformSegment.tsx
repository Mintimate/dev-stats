import type { ManualConfig } from "../lib/types";

/**
 * 平台切换分段控件，被 AgentPanel 与 ManualOptions 共用。
 */
export function PlatformSegment({
  platform,
  disabled,
  onChange,
}: {
  platform: ManualConfig["platform"];
  disabled?: boolean;
  onChange: (platform: ManualConfig["platform"]) => void;
}) {
  return (
    <div className="segmented">
      <button type="button" data-platform="github" disabled={disabled} className={platform === "github" ? "active" : ""} onClick={() => onChange("github")}>
        GitHub
      </button>
      <button type="button" data-platform="cnb" disabled={disabled} className={platform === "cnb" ? "active" : ""} onClick={() => onChange("cnb")}>
        CNB
      </button>
    </div>
  );
}
