/**
 * Minimal, platform-neutral cancellation view used by Core ports. Browser and
 * Node AbortSignal objects satisfy this shape without making Core depend on
 * DOM declarations.
 */
export interface CancellationSignal {
  readonly aborted: boolean;
}
