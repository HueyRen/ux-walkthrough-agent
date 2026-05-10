const PATTERNS = {
  station:    /(?:^##\s+)?S(\d+)\s+(.+)/i,
  screenshot: /r\d+_s\d+_(?:step|issue)\d+.*\.(?:jpe?g|png)/i,
  issue:      /P-S\d+-\d+/,
  complete:   /manifest\.json/,
  error:      /(?:ERROR|FATAL|timeout|crash)/i,
};

function createParser(onEvent) {
  return function processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    const stationMatch = trimmed.match(PATTERNS.station);
    if (stationMatch) {
      onEvent({ type: 'station', payload: { station: `S${stationMatch[1]}`, name: stationMatch[2].trim() } });
    }

    const screenshotMatch = trimmed.match(PATTERNS.screenshot);
    if (screenshotMatch) {
      onEvent({ type: 'screenshot', payload: { file: screenshotMatch[0] } });
    }

    const issueMatch = trimmed.match(PATTERNS.issue);
    if (issueMatch) {
      onEvent({ type: 'issue', payload: { id: issueMatch[0] } });
    }

    if (PATTERNS.complete.test(trimmed)) {
      onEvent({ type: 'complete', payload: {} });
    }

    if (PATTERNS.error.test(trimmed)) {
      onEvent({ type: 'error', payload: { message: trimmed } });
    }
  };
}

module.exports = { createParser };
