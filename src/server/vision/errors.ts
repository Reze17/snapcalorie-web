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
