import { useEffect, useState, type FormEvent } from "react";
import { MoonStar, SunMedium } from "lucide-react";

import type { AppPreferences } from "../domain/types";

interface AppearanceInspectorProps {
  preferences: AppPreferences;
  maximumBrightness: number;
  pending: boolean;
  onSave: (preferences: AppPreferences) => void;
}

export function AppearanceInspector({
  preferences,
  maximumBrightness,
  pending,
  onSave,
}: AppearanceInspectorProps) {
  const [brightness, setBrightness] = useState(preferences.brightness);
  const [reduceMotion, setReduceMotion] = useState(
    preferences.reduceMotion,
  );

  useEffect(() => {
    setBrightness(preferences.brightness);
    setReduceMotion(preferences.reduceMotion);
  }, [preferences]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ brightness, reduceMotion });
  };

  return (
    <aside className="inspector" aria-label="Appearance settings">
      <div className="panel-heading">
        <span>Appearance</span>
        <span className="tag">Host policy</span>
      </div>
      <div className="inspector-summary">
        <span className="inspector-summary__icon">
          <SunMedium size={18} />
        </span>
        <div>
          <strong>One accessible presentation policy</strong>
          <p>Applied to the simulator now and the keyboard later.</p>
        </div>
      </div>
      <form className="settings-form" onSubmit={submit}>
        <div className="field">
          <div className="field-heading">
            <label htmlFor="surface-brightness">LED brightness</label>
            <output htmlFor="surface-brightness">
              {Math.round((brightness / Math.max(maximumBrightness, 1)) * 100)}%
              {" "}of safe range
            </output>
          </div>
          <input
            id="surface-brightness"
            type="range"
            min="0"
            max={maximumBrightness}
            value={brightness}
            onChange={(event) => setBrightness(event.target.valueAsNumber)}
          />
          <p>
            The keyboard caps this range at {maximumBrightness}/255 (about{" "}
            {Math.round((maximumBrightness / 255) * 100)}% per channel) and
            scales dense scenes to its per-half current budget.
          </p>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
          />
          <span className="checkbox-row__icon">
            <MoonStar size={17} />
          </span>
          <span>
            <strong>Use steady status lights</strong>
            <small>Replace working and input-needed pulses with solid color.</small>
          </span>
        </label>
        <button
          className="button button--primary button--full"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save appearance"}
        </button>
      </form>
      <section className="inspector-section appearance-key">
        <p className="eyebrow">Default meanings</p>
        <dl>
          <div><dt><i className="state-dot state-dot--idle" /> Idle</dt><dd>White</dd></div>
          <div><dt><i className="state-dot state-dot--working" /> Working</dt><dd>Blue</dd></div>
          <div><dt><i className="state-dot state-dot--completedUnread" /> Done</dt><dd>Green</dd></div>
          <div><dt><i className="state-dot state-dot--needsInput" /> Input</dt><dd>Amber</dd></div>
          <div><dt><i className="state-dot state-dot--failed" /> Failed</dt><dd>Red</dd></div>
        </dl>
      </section>
      <p className="inspector-footnote">
        Color is always paired with a symbol and text in the app.
      </p>
    </aside>
  );
}
