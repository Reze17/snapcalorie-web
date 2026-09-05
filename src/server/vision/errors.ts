export class VisionServiceTimeoutError extends Error {
  constructor(message = "Vision provider request timed out") {
    super(message);
    this.name = "VisionServiceTimeoutError";
  }
}

export class VisionServiceNotImplementedError extends Error {
  constructor(provider: string) {
    super(
      `Vision provider "${provider}" is not implemented yet (Phase 3 only ships the mock).`,
    );
    this.name = "VisionServiceNotImplementedError";
  }
}

/**
 * The model responded, but never produced a valid tool call matching our
 * schema — even after one repair-prompt retry. Callers should fall back to
 * a user-facing "couldn't read this plate" state (manual search / custom
 * entry), not crash.
 */
export class VisionAnalysisFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisionAnalysisFailedError";
  }
}
