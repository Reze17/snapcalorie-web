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
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Daily calorie target
        <input
          type="number"
          name="dailyCalorieTarget"
          defaultValue={dailyCalorieTarget}
          min={800}
          max={8000}
          step={1}
          required
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Timezone
        <select
          name="timezone"
          value={selectedTimezone}
          onChange={(e) => setSelectedTimezone(e.target.value)}
          className="rounded border border-white/20 bg-transparent px-3 py-2"
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>
      {state.error && (
        <p className="text-sm text-[var(--foreground)]/70">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-[var(--foreground)]/70">Saved.</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
