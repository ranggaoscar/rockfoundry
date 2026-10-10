/** Only controlled adapter messages may cross into persisted diagnostics. */
export class ExecutorError extends Error {
  constructor(
    public readonly code: string,
    public readonly safeMessage: string,
  ) {
    super(safeMessage);
  }
}
