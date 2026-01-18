/**
 * Activity Monitor Service
 *
 * Tracks user activity and triggers logout on inactivity timeout.
 * Monitors mouse movements, keyboard input, and other user interactions.
 */

export class ActivityMonitor {
  private lastActivityTime: number;
  private inactivityTimeoutId: number | null = null;
  private onInactivityCallback: (() => void) | null = null;
  private inactivityTimeoutMs: number;
  private warningTimeoutMs: number;
  private onWarningCallback: (() => void) | null = null;
  private isMonitoring: boolean = false;

  // Default: 30 minutes inactivity timeout, 5 minutes warning before timeout
  constructor(
    inactivityTimeoutMinutes: number = 30,
    warningBeforeTimeoutMinutes: number = 5
  ) {
    this.lastActivityTime = Date.now();
    this.inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
    this.warningTimeoutMs = (inactivityTimeoutMinutes - warningBeforeTimeoutMinutes) * 60 * 1000;
  }

  /**
   * Start monitoring user activity
   */
  public start(
    onInactivity: () => void,
    onWarning?: () => void
  ): void {
    if (this.isMonitoring) {
      return;
    }

    this.onInactivityCallback = onInactivity;
    this.onWarningCallback = onWarning || null;
    this.lastActivityTime = Date.now();
    this.isMonitoring = true;

    // Add event listeners for user activity
    this.addActivityListeners();

    // Start checking for inactivity
    this.resetInactivityTimer();

    console.log('[ActivityMonitor] Started monitoring user activity');
  }

  /**
   * Stop monitoring user activity
   */
  public stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.removeActivityListeners();
    this.clearInactivityTimer();
    this.isMonitoring = false;

    console.log('[ActivityMonitor] Stopped monitoring user activity');
  }

  /**
   * Reset the inactivity timer (called on user activity)
   */
  private resetInactivityTimer(): void {
    this.clearInactivityTimer();

    // Check every second if user has been inactive
    this.inactivityTimeoutId = window.setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - this.lastActivityTime;

      // Show warning if approaching timeout
      if (
        this.onWarningCallback &&
        timeSinceLastActivity >= this.warningTimeoutMs &&
        timeSinceLastActivity < this.inactivityTimeoutMs
      ) {
        const timeUntilLogout = Math.ceil((this.inactivityTimeoutMs - timeSinceLastActivity) / 1000);
        if (timeUntilLogout % 60 === 0) { // Only warn every minute
          this.onWarningCallback();
        }
      }

      // Logout on inactivity timeout
      if (timeSinceLastActivity >= this.inactivityTimeoutMs) {
        console.warn('[ActivityMonitor] Inactivity timeout reached, logging out...');
        this.clearInactivityTimer();
        if (this.onInactivityCallback) {
          this.onInactivityCallback();
        }
      }
    }, 1000);
  }

  /**
   * Clear the inactivity timer
   */
  private clearInactivityTimer(): void {
    if (this.inactivityTimeoutId !== null) {
      clearInterval(this.inactivityTimeoutId);
      this.inactivityTimeoutId = null;
    }
  }

  /**
   * Record user activity
   */
  private recordActivity = (): void => {
    this.lastActivityTime = Date.now();
  };

  /**
   * Add event listeners for user activity
   */
  private addActivityListeners(): void {
    // Mouse events
    window.addEventListener('mousedown', this.recordActivity);
    window.addEventListener('mousemove', this.recordActivity);
    window.addEventListener('wheel', this.recordActivity);

    // Keyboard events
    window.addEventListener('keydown', this.recordActivity);
    window.addEventListener('keypress', this.recordActivity);

    // Touch events (for tablets/mobile)
    window.addEventListener('touchstart', this.recordActivity);
    window.addEventListener('touchmove', this.recordActivity);

    // Focus events
    window.addEventListener('focus', this.recordActivity);

    // Click events
    window.addEventListener('click', this.recordActivity);
  }

  /**
   * Remove event listeners
   */
  private removeActivityListeners(): void {
    window.removeEventListener('mousedown', this.recordActivity);
    window.removeEventListener('mousemove', this.recordActivity);
    window.removeEventListener('wheel', this.recordActivity);
    window.removeEventListener('keydown', this.recordActivity);
    window.removeEventListener('keypress', this.recordActivity);
    window.removeEventListener('touchstart', this.recordActivity);
    window.removeEventListener('touchmove', this.recordActivity);
    window.removeEventListener('focus', this.recordActivity);
    window.removeEventListener('click', this.recordActivity);
  }

  /**
   * Get time since last activity in seconds
   */
  public getTimeSinceLastActivity(): number {
    return Math.floor((Date.now() - this.lastActivityTime) / 1000);
  }

  /**
   * Get time until logout in seconds
   */
  public getTimeUntilLogout(): number {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    const timeRemaining = this.inactivityTimeoutMs - timeSinceLastActivity;
    return Math.max(0, Math.floor(timeRemaining / 1000));
  }

  /**
   * Manually update the inactivity timeout
   */
  public updateTimeout(inactivityTimeoutMinutes: number): void {
    this.inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
    console.log(`[ActivityMonitor] Updated inactivity timeout to ${inactivityTimeoutMinutes} minutes`);
  }
}

// Singleton instance
export const activityMonitor = new ActivityMonitor();
