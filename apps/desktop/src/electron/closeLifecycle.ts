export type CloseIntent = "window" | "quit";
export type CloseChoice = "save" | "discard" | "cancel";

export class CloseLifecycle {
  private dirty = false;
  private promptOpen = false;
  private pendingSaveIntent: CloseIntent | undefined;
  private windowCloseAuthorized = false;
  private quitAuthorized = false;

  setDraftDirty(dirty: boolean): CloseIntent | undefined {
    this.dirty = dirty;
    if (dirty || !this.pendingSaveIntent) return undefined;

    const intent = this.pendingSaveIntent;
    this.pendingSaveIntent = undefined;
    return intent;
  }

  shouldPrompt(intent: CloseIntent): boolean {
    if (this.quitAuthorized) return false;
    if (intent === "window" && this.windowCloseAuthorized) {
      this.windowCloseAuthorized = false;
      return false;
    }
    return this.dirty;
  }

  beginPrompt(): boolean {
    if (this.promptOpen) return false;
    this.promptOpen = true;
    this.pendingSaveIntent = undefined;
    return true;
  }

  resolvePrompt(
    intent: CloseIntent,
    choice: CloseChoice,
  ): CloseIntent | undefined {
    this.promptOpen = false;
    this.pendingSaveIntent = choice === "save" ? intent : undefined;
    return choice === "discard" ? intent : undefined;
  }

  cancelPrompt(): void {
    this.promptOpen = false;
    this.pendingSaveIntent = undefined;
  }

  authorize(intent: CloseIntent): void {
    this.dirty = false;
    this.pendingSaveIntent = undefined;
    if (intent === "quit") {
      this.quitAuthorized = true;
    } else {
      this.windowCloseAuthorized = true;
    }
  }

  resetWindow(): void {
    this.dirty = false;
    this.promptOpen = false;
    this.pendingSaveIntent = undefined;
    this.windowCloseAuthorized = false;
  }
}
