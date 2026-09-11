"use client";

import { useActionState, useEffect, useState } from "react";
import { updateProfileAction, type ProfileState } from "./actions";

const initialState: ProfileState = {};

export function ProfileForm({
  dailyCalorieTarget,
  timezone,
}: {
  dailyCalorieTarget: number;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );
  const [timezones, setTimezones] = useState<string[]>([timezone]);
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);

  useEffect(() => {
    const list = Intl.supportedValuesOf("timeZone");
    setTimezones(list);
    // Only override the stored value with the browser's zone when the
    // user has never customized it away from the schema default.
    if (timezone === "UTC") {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (list.includes(detected)) {
        setSelectedTimezone(detected);
      }
    }
  }, [timezone]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">Daily calorie goal</span>
        <input
          type="number"
          name="dailyCalorieTarget"
          defaultValue={dailyCalorieTarget}
          min={800}
          max={8000}
          step={1}
          required
          className="num rounded-xl border border-border bg-bg px-3 py-2.5 text-base"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">Timezone</span>
        <select
          name="timezone"
          value={selectedTimezone}
          onChange={(e) => setSelectedTimezone(e.target.value)}
          className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p className="text-sm text-err">{state.error}</p>}
      {state.success && (
        <p className="text-sm font-semibold text-good">Saved.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
