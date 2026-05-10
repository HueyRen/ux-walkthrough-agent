'use strict';

class WalkthroughChecker {
  constructor(stations, maxFatalErrors = 5) {
    this.stations = stations; // [{id, name}]
    this.maxFatalErrors = maxFatalErrors;
    this.completed = new Set();
    this.skipped = new Set();
    this.fatalCount = 0;
    this.errors = [];
    this.currentStation = null;
    this.stationIssues = {}; // stationId → issue count
    this.retries = {}; // stationId → retry count
  }

  setCurrent(stationId) {
    this.currentStation = stationId;
    if (!this.stationIssues[stationId]) this.stationIssues[stationId] = 0;
  }

  recordComplete(stationId) {
    this.completed.add(stationId);
  }

  recordIssue(stationId) {
    this.stationIssues[stationId] = (this.stationIssues[stationId] || 0) + 1;
  }

  recordError(stationId, error) {
    const classification = this._classifyError(error);
    this.errors.push({ stationId, error: error.message, type: classification.type });

    if (classification.type === 'fatal') {
      this.fatalCount++;
      this.skipped.add(stationId);
    } else if (classification.type === 'soft') {
      this.skipped.add(stationId);
    } else if (classification.type === 'retryable') {
      const retryCount = this.retries[stationId] || 0;
      if (retryCount >= 2) {
        this.skipped.add(stationId);
        classification.shouldRetry = false;
      } else {
        this.retries[stationId] = retryCount + 1;
        classification.shouldRetry = true;
      }
    }

    return classification;
  }

  shouldHalt() {
    return this.fatalCount >= this.maxFatalErrors;
  }

  finalStatus() {
    if (this.completed.size === 0) return 'failed';
    if (this.fatalCount >= this.maxFatalErrors) return 'partial';
    if (this.completed.size === this.stations.length) return 'done';
    if (this.completed.size > 0) return 'partial';
    return 'failed';
  }

  toProgress() {
    const stationsMap = {};
    for (const s of this.stations) {
      let status = 'pending';
      if (this.completed.has(s.id)) status = 'done';
      else if (this.skipped.has(s.id)) status = 'skipped';
      else if (s.id === this.currentStation) status = 'current';
      stationsMap[s.id] = { status, issues: this.stationIssues[s.id] || 0 };
    }

    return {
      total: this.stations.length,
      completed: this.completed.size,
      skipped: this.skipped.size,
      fatal_errors: this.fatalCount,
      max_fatal: this.maxFatalErrors,
      current_station: this.currentStation,
      stations: stationsMap,
    };
  }

  _classifyError(error) {
    const msg = (error.message || '').toLowerCase();
    const name = (error.name || '').toLowerCase();

    // Retryable: network issues, rate limits, timeouts
    if (name === 'timeouterror' || msg.includes('timeout')) {
      return { type: 'retryable', shouldRetry: true, message: 'Timeout — will retry' };
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('503')) {
      return { type: 'retryable', shouldRetry: true, message: 'Rate limited — will retry' };
    }
    if (msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('fetch failed')) {
      return { type: 'retryable', shouldRetry: true, message: 'Network error — will retry' };
    }

    // Fatal: auth failures, browser crashes, unrecoverable
    if (msg.includes('401') || msg.includes('403') || msg.includes('authentication') || msg.includes('api key')) {
      return { type: 'fatal', shouldRetry: false, message: 'Auth failure' };
    }
    if (msg.includes('browser') && (msg.includes('crash') || msg.includes('disconnected'))) {
      return { type: 'fatal', shouldRetry: false, message: 'Browser crashed' };
    }
    if (msg.includes('target closed') || msg.includes('browser has been closed')) {
      return { type: 'fatal', shouldRetry: false, message: 'Browser closed unexpectedly' };
    }

    // Soft: element interaction failures, non-critical
    if (msg.includes('element') && (msg.includes('not found') || msg.includes('not visible'))) {
      return { type: 'soft', shouldRetry: false, message: 'Element not found — skipping' };
    }
    if (msg.includes('cookie') || msg.includes('consent')) {
      return { type: 'soft', shouldRetry: false, message: 'Cookie/consent issue — skipping' };
    }

    // Default: treat unknown errors as fatal
    return { type: 'fatal', shouldRetry: false, message: error.message };
  }
}

module.exports = { WalkthroughChecker };
