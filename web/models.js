'use strict';

const { createAnthropic } = require('@ai-sdk/anthropic');

const anthropic = createAnthropic();

const registry = {
  'claude-sonnet': anthropic('claude-sonnet-4-20250514'),
  'claude-opus': anthropic('claude-opus-4-20250514'),
};

function getModel(name) {
  return registry[name] || registry['claude-sonnet'];
}

module.exports = { getModel };
